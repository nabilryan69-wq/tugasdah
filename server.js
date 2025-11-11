// server.js — final combined (Node 18+, ESM)
// Features: dotenv, static serve, CORS (dev), node-cache, rate-limit,
// geocode via Nominatim, /api/timelines, /api/alerts, /api/ai/chat -> OpenAI

import express from "express";
import rateLimit from "express-rate-limit";
import NodeCache from "node-cache";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TOMORROW_KEY = process.env.TOMORROW_API_KEY;
const PORT = process.env.PORT || 3000;

console.log("OPENAI_API_KEY:", OPENAI_KEY ? "✅ Loaded" : "❌ Missing");
console.log("TOMORROW_API_KEY:", TOMORROW_KEY ? "✅ Loaded" : "❌ Missing");
console.log("Server root:", __dirname);

app.use("/api/ai", rateLimit({ windowMs: 60_000, max: 30 }));
const cache = new NodeCache({ stdTTL: 60 });

/* ---------- Tomorrow timelines helper ---------- */
async function fetchTimelinesLatLon(lat, lon, units = "metric") {
  const cacheKey = `timelines:${lat},${lon}:${units}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!TOMORROW_KEY) throw new Error("TOMORROW_API_KEY missing");

  const fields = [
    "temperature","temperatureApparent","humidity","windSpeed",
    "weatherCode","precipitationProbability","precipitationIntensity",
    "uvIndex","cloudCover","pressureSurfaceLevel","sunriseTime","sunsetTime"
  ].join(",");

  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    fields,
    timesteps: "current,1h,1d",
    units: units === "metric" ? "metric" : "imperial",
    timezone: "Asia/Jakarta",
    apikey: TOMORROW_KEY
  });

  const url = `https://api.tomorrow.io/v4/timelines?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text().catch(()=>"");
    throw new Error(`Tomorrow timelines error ${r.status}: ${t}`);
  }
  const json = await r.json();
  cache.set(cacheKey, json, 45);
  return json;
}

/* ---------- Geocoding: Nominatim (OpenStreetMap) ---------- */
async function geocodeCity(query) {
  const cacheKey = `geo:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const q = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=0`;
    const r = await fetch(url, {
      headers: { "User-Agent": "MyWeatherApp/1.0 (youremail@example.com)" }
    });
    if (!r.ok) {
      cache.set(cacheKey, null, 60);
      return null;
    }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      cache.set(cacheKey, null, 60);
      return null;
    }
    const first = arr[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    const name = first.display_name || query;
    const res = { lat, lon, name };
    cache.set(cacheKey, res, 3600);
    return res;
  } catch (e) {
    console.warn("geocodeCity (nominatim) error", e);
    cache.set(cacheKey, null, 60);
    return null;
  }
}

/* ---------- Alert detection ---------- */
function detectAlertsFromTimelines(timelinesJson) {
  const alerts = [];
  try {
    const getTimeline = (t) => timelinesJson?.data?.timelines?.find(x=>x.timestep===t)?.intervals || [];
    const hourly = getTimeline("1h");
    const current = getTimeline("current")?.[0] || null;
    const nextHours = hourly.slice(0, 12);

    let heavyRain=null, highPop=null;
    nextHours.forEach(iv=>{
      const v = iv.values || {};
      const pop = v.precipitationProbability ?? 0;
      const precip = v.precipitationIntensity ?? 0;
      const wind = v.windSpeed ?? 0;
      if (precip >= 6 && !heavyRain) heavyRain = { time: iv.startTime, precip, pop };
      if (pop >= 70 && !highPop) highPop = { time: iv.startTime, pop };
      if (wind >= 15 && !alerts.some(a=>a.code==="strong_wind")) {
        alerts.push({ code:"strong_wind", level:"warning", title:"Angin Kencang", message:`Angin ~${Math.round(wind)} m/s pada ${iv.startTime}`});
      }
    });

    const daily = getTimeline("1d");
    const today = daily[0]?.values || null;
    if (today) {
      if (today.temperatureMax != null && today.temperatureMax >= 35) alerts.push({ code:"heat", level:"warning", title:"Gelombang Panas", message:`Suhu maks ${Math.round(today.temperatureMax)}° hari ini.`});
      if (today.temperatureMin != null && today.temperatureMin <= 2) alerts.push({ code:"freeze", level:"warning", title:"Suhu Rendah", message:`Suhu min ${Math.round(today.temperatureMin)}° hari ini.`});
    }

    if (heavyRain) alerts.push({ code:"heavy_rain", level:"danger", title:"Hujan Lebat", message:`Hujan lebat ~${heavyRain.precip} mm/jam (POP ${Math.round(heavyRain.pop)}%) pada ${heavyRain.time}`});
    else if (highPop) alerts.push({ code:"possible_rain", level:"notice", title:"Peluang Hujan Tinggi", message:`Peluang hujan ${Math.round(highPop.pop)}% dalam 12 jam ke depan.`});

    const curVals = current?.values || {};
    if (curVals.uvIndex != null && curVals.uvIndex >= 8) alerts.push({ code:"high_uv", level:"notice", title:"UV Tinggi", message:`Indeks UV ${curVals.uvIndex}. Gunakan tabir surya.`});
  } catch(e) {
    console.warn("detectAlerts error", e);
  }
  return alerts;
}

/* ---------- API: /api/timelines ---------- */
app.post("/api/timelines", async (req, res) => {
  try {
    const { city, lat, lon, units="metric" } = req.body;
    let coords = null;
    if (lat != null && lon != null) coords = { lat, lon, name: `${lat},${lon}` };
    else if (city) {
      const g = await geocodeCity(city);
      if (!g) return res.status(404).json({ error: "Location not found" });
      coords = { lat: g.lat, lon: g.lon, name: g.name };
    } else return res.status(400).json({ error: "Provide city or lat/lon" });

    const timelines = await fetchTimelinesLatLon(coords.lat, coords.lon, units);
    return res.json({ location: coords.name || `${coords.lat},${coords.lon}`, coords: { lat: coords.lat, lon: coords.lon }, timelines });
  } catch (err) {
    console.error("timelines err", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch timelines", detail: err?.message || String(err) });
  }
});

/* ---------- API: /api/alerts ---------- */
app.post("/api/alerts", async (req, res) => {
  try {
    const { city, lat, lon, units="metric" } = req.body;
    let coords = null;
    if (lat != null && lon != null) coords = { lat, lon };
    else if (city) {
      const g = await geocodeCity(city);
      if (!g) return res.json({ alerts: [] });
      coords = { lat: g.lat, lon: g.lon };
    } else return res.status(400).json({ error: "Provide city or lat/lon" });

    const timelinesJson = await fetchTimelinesLatLon(coords.lat, coords.lon, units);
    const alerts = detectAlertsFromTimelines(timelinesJson);
    return res.json({ alerts });
  } catch (err) {
    console.error("alerts err", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------- API: /api/ai/chat ---------- */
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { question, city, lat, lon, units="metric" } = req.body;
    if (!question) return res.status(400).json({ error: "Missing question" });
    if (!OPENAI_KEY) return res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY missing" });

    let coords = null;
    if (lat != null && lon != null) coords = { lat, lon, name: `${lat},${lon}` };
    else if (city) {
      const g = await geocodeCity(city);
      if (g) coords = { lat: g.lat, lon: g.lon, name: g.name };
    }
    if (!coords) return res.status(400).json({ error: "Missing location (city or lat/lon)" });

    const timelinesJson = await fetchTimelinesLatLon(coords.lat, coords.lon, units);
    const getTimeline = (timestep) => timelinesJson?.data?.timelines?.find(t=>t.timestep===timestep)?.intervals || [];
    const current = getTimeline("current")?.[0]?.values || {};
    const hourly = getTimeline("1h")?.slice(0,8).map(iv => ({ time: iv.startTime, ...iv.values })) || [];
    const daily = getTimeline("1d")?.slice(0,3).map(iv => ({ date: iv.startTime, ...iv.values })) || [];
    const alerts = detectAlertsFromTimelines(timelinesJson);

    const weatherContext = { location: coords.name || `${coords.lat},${coords.lon}`, current, hourly, daily, alerts };

    const systemPrompt = `Anda adalah asisten cuaca yang singkat dan praktis. Jawab dalam Bahasa Indonesia. Berikan rekomendasi aksi (contoh: bawa payung, tunda lari pagi) dan alasan singkat berdasarkan data cuaca yang diberikan. Jangan membuat klaim diluar data.`;
    const userPrompt = `${question}\n\nRingkasan data cuaca (JSON):\n${JSON.stringify(weatherContext)}`;

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!openaiResp.ok) {
      const t = await openaiResp.text().catch(()=>"");
      console.error("OpenAI error", openaiResp.status, t);
      return res.status(502).json({ error: "AI provider error", status: openaiResp.status, detail: t });
    }
    const openaiJson = await openaiResp.json();
    const assistantText = openaiJson?.choices?.[0]?.message?.content ?? "";

    return res.json({ answer: assistantText, weatherContext });
  } catch (err) {
    console.error("ai chat err", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Serve static frontend ---------- */
app.use(express.static(__dirname));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

/* ---------- Start server ---------- */
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
