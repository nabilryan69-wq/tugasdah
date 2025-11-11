// script.js — frontend: calls /api/timelines, /api/alerts, /api/ai/chat
let units = localStorage.getItem("units") || "metric";

/* DOM refs */
const input = document.getElementById("userlocation");
const converter = document.getElementById("converter");
const searchBtn = document.getElementById("searchBtn");

const temperatureEl = document.getElementById("temperature");
const feelslikeEl = document.getElementById("feelslike");
const descriptionEl = document.getElementById("description");
const weatherIconEl = document.getElementById("weatherIcon");
const dateEl = document.getElementById("date");
const cityEl = document.getElementById("city");

const humidityEl = document.getElementById("humidityValue");
const windEl = document.getElementById("windValue");
const cloudEl = document.getElementById("cloudValue");
const pressureEl = document.getElementById("pressureValue");
const sunriseEl = document.getElementById("sunriseValue");
const sunsetEl = document.getElementById("sunsetValue");
const uvEl = document.getElementById("uvValue");

const forecastContainer = document.getElementById("forecast");
let hourlyContainer = document.getElementById("hourlyForecast");

/* events */
converter.value = units;
converter.addEventListener("change", () => { units = converter.value; localStorage.setItem("units", units); const q = input.value.trim(); if (q) searchCity(q); });
input.addEventListener("keydown", (e)=>{ if (e.key==="Enter") onSearch(); });
searchBtn.addEventListener("click", onSearch);
function onSearch(){ const q = input.value.trim(); if (!q) return; searchCity(q); }

/* mapping */
const TOMORROW_WEATHER_MAP = {
  1000:{label:"Cerah",icon:"☀️"},1001:{label:"Berawan",icon:"☁️"},
  1100:{label:"Cerah sebagian",icon:"🌤️"},1101:{label:"Berawan sebagian",icon:"⛅"},
  1102:{label:"Banyak awan",icon:"☁️"},
  2000:{label:"Kabut",icon:"🌫️"},2100:{label:"Kabut ringan",icon:"🌫️"},
  3000:{label:"Angin",icon:"💨"},3001:{label:"Angin kencang",icon:"💨"},
  4000:{label:"Gerimis / Hujan ringan",icon:"🌦️"},4001:{label:"Hujan",icon:"🌧️"},
  4200:{label:"Hujan & Salju",icon:"🌨️"},4201:{label:"Hujan lebat",icon:"⛈️"},
  5000:{label:"Salju ringan",icon:"❄️"},5001:{label:"Salju",icon:"❄️"},
  5100:{label:"Hujan es",icon:"🌨️"},5101:{label:"Hujan es ringan",icon:"🌨️"},
  6000:{label:"Hujan es kecil",icon:"🧊"},7000:{label:"Asap / Polusi",icon:"🚫"},
  8000:{label:"Cuaca tidak biasa",icon:"❓"}
};
function humanizeWeather(code){
  if (code==null) return {label:"—",icon:"🌥️"};
  const e = TOMORROW_WEATHER_MAP[code];
  if (e) return e;
  if (code>=1000 && code<2000) return {label:"Cerah / Berawan",icon:"⛅"};
  if (code>=2000 && code<3000) return {label:"Kabut",icon:"🌫️"};
  if (code>=3000 && code<4000) return {label:"Berangin",icon:"💨"};
  if (code>=4000 && code<5000) return {label:"Hujan",icon:"🌧️"};
  if (code>=5000 && code<6000) return {label:"Salju",icon:"❄️"};
  return {label:`Cuaca (kode ${code})`,icon:"🌥️"};
}

/* helpers */
function unitSymbol(){ return units==="metric" ? "°C" : "°F"; }
function windUnit(){ return units==="metric" ? "m/s" : "mph"; }
function formatTime(ts){ const d = new Date(ts*1000); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function formatDate(ts){ const d = new Date(ts*1000); return d.toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short"}); }
function showError(msg){
  cityEl.textContent = msg; temperatureEl.textContent="--"; feelslikeEl.textContent="Terasa --"; descriptionEl.textContent="—";
  humidityEl.textContent="—"; windEl.textContent="—"; cloudEl.textContent="—"; pressureEl.textContent="—";
  sunriseEl.textContent="—"; sunsetEl.textContent="—"; uvEl.textContent="—";
  forecastContainer.innerHTML = "<div style='color:var(--muted)'>Ramalan tidak tersedia.</div>";
  hourlyContainer.innerHTML = "<div style='color:var(--muted)'>Ramalan per jam tidak tersedia.</div>";
}

/* POST helper */
async function postJson(url, body){
  try{
    const resp = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const text = await resp.text();
    try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; }
    catch(e){ return { ok: resp.ok, status: resp.status, data: text }; }
  }catch(err){ return { ok:false, error: err.message || String(err) }; }
}

/* Renderers */
function renderForecast(forecastData, container){
  container.innerHTML="";
  if(!forecastData||!forecastData.daily||forecastData.daily.length===0){ container.innerHTML="<div style='color:var(--muted)'>Ramalan tidak tersedia.</div>"; return; }
  const days = forecastData.daily.slice(0,7);
  days.forEach(d=>{
    const date = formatDate(d.dt);
    const hw = humanizeWeather(d.values?.weatherCode ?? null);
    const min = Math.round(d.values?.temperatureMin ?? d.values?.temperature ?? NaN);
    const max = Math.round(d.values?.temperatureMax ?? d.values?.temperature ?? NaN);
    const pop = typeof d.values?.precipitationProbability !== "undefined" ? `${Math.round(d.values.precipitationProbability)}%` : "—";
    const card = document.createElement("div"); card.className="forecast-card";
    card.innerHTML = `<div class="forecast-date">${date}</div>
      <div style="display:flex;align-items:center;gap:8px"><div style="font-size:18px">${hw.icon}</div><div style="font-size:13px;color:var(--muted)">${hw.label}</div></div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px"><div class="forecast-temp">${max}${unitSymbol()}</div><div style="font-size:13px;color:var(--muted)">min ${min}${unitSymbol()}</div><div style="font-size:12px;color:var(--muted);margin-left:6px">💧 ${pop}</div></div>`;
    container.appendChild(card);
  });
}
function renderHourlyForecast(forecastData, container){
  container.innerHTML="";
  if(!forecastData||!forecastData.hourly||forecastData.hourly.length===0){ container.innerHTML="<div style='color:var(--muted)'>Ramalan per jam tidak tersedia.</div>"; return; }
  const hours = forecastData.hourly.slice(1,9);
  hours.forEach(h=>{
    const time = formatTime(h.dt);
    const temp = Math.round(h.values?.temperature ?? NaN);
    const hw = humanizeWeather(h.values?.weatherCode ?? null);
    const pop = typeof h.values?.precipitationProbability !== "undefined" ? `${Math.round(h.values.precipitationProbability)}%` : "—";
    const card = document.createElement("div"); card.className="forecast-card";
    card.innerHTML = `<div class="forecast-date">${time}</div>
      <div style="display:flex;align-items:center;gap:8px"><div style="font-size:18px">${hw.icon}</div><div style="font-size:13px;color:var(--muted)">${hw.label}</div></div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px"><div class="forecast-temp">${temp}${unitSymbol()}</div><div style="font-size:12px;color:var(--muted)">💧 ${pop}</div></div>`;
    container.appendChild(card);
  });
}

/* Leaflet map (init & update) */
let map = null, mapMarker = null;
function initMap(){
  if (typeof L === "undefined") return;
  if (map) return;
  try {
    map = L.map('map', { zoomControl:true }).setView([0,0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  } catch(e) { console.warn("Leaflet init error", e); }
}
function updateMap(lat, lon, temp=null, label=""){
  if (typeof L === "undefined") return;
  initMap();
  if (!map) return;
  map.setView([lat, lon], 10, { animate:true });
  if (mapMarker) map.removeLayer(mapMarker);
  const popupText = temp != null ? `${label || ""} ${temp}${unitSymbol()}` : (label || "Lokasi");
  mapMarker = L.marker([lat, lon]).addTo(map).bindPopup(popupText).openPopup();
}
document.addEventListener("DOMContentLoaded", initMap);

/* client geocode fallback (Nominatim) */
async function geocodeClient(query){
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length===0) return null;
    return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
  }catch(e){ return null; }
}

/* searchCity (calls server) */
async function searchCity(query){
  try{
    cityEl.textContent = "Memuat...";
    const r = await postJson('/api/timelines', { city: query, units });
    if (!r.ok) { console.error('/api/timelines', r); showError("Ramalan tidak tersedia (timelines)."); return; }
    const data = r.data;
    const timelines = data?.timelines?.data?.timelines || [];
    const parsed = { current:null, hourly:[], daily:[] };
    timelines.forEach(t=>{
      if (t.timestep==="current") parsed.current = { dt: Math.floor(new Date(t.intervals[0].startTime).getTime()/1000), values: t.intervals[0].values };
      if (t.timestep==="1h") t.intervals.forEach(iv=> parsed.hourly.push({ dt: Math.floor(new Date(iv.startTime).getTime()/1000), values: iv.values }));
      if (t.timestep==="1d") t.intervals.forEach(iv=> parsed.daily.push({ dt: Math.floor(new Date(iv.startTime).getTime()/1000), values: iv.values }));
    });

    const curVals = parsed.current?.values || {};
    const temp = Number.isFinite(curVals.temperature) ? Math.round(curVals.temperature) : null;
    const feels = Number.isFinite(curVals.temperatureApparent) ? Math.round(curVals.temperatureApparent) : temp;
    const hw = humanizeWeather(curVals.weatherCode ?? null);

    temperatureEl.textContent = temp != null ? `${temp}${unitSymbol()}` : `--`;
    feelslikeEl.textContent = feels != null ? `Terasa ${feels}${unitSymbol()}` : "Terasa --";
    descriptionEl.textContent = hw.label;
    weatherIconEl.innerHTML = `<div style="font-size:48px">${hw.icon}</div>`;
    dateEl.textContent = new Date().toLocaleString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });
    cityEl.textContent = query;

    humidityEl.textContent = (curVals.humidity != null) ? `${Math.round(curVals.humidity)}%` : "—";
    windEl.textContent = (curVals.windSpeed != null) ? `${Math.round(curVals.windSpeed*10)/10} ${windUnit()}` : "—";
    cloudEl.textContent = (curVals.cloudCover != null) ? `${Math.round(curVals.cloudCover)}%` : "—";
    pressureEl.textContent = (curVals.pressureSurfaceLevel != null) ? `${Math.round(curVals.pressureSurfaceLevel)} hPa` : "—";
    sunriseEl.textContent = curVals.sunriseTime ? (new Date(curVals.sunriseTime)).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "—";
    sunsetEl.textContent = curVals.sunsetTime ? (new Date(curVals.sunsetTime)).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "—";
    uvEl.textContent = (curVals.uvIndex != null) ? `${curVals.uvIndex.toFixed ? curVals.uvIndex.toFixed(1) : curVals.uvIndex}` : "—";

    renderForecast({ daily: parsed.daily }, forecastContainer);
    renderHourlyForecast({ hourly: parsed.hourly }, hourlyContainer);

    // coords: prefer server coords, fallback to client geocode
    const coords = data?.coords ?? (await geocodeClient(query));
    if (coords && coords.lat && coords.lon) updateMap(coords.lat, coords.lon, temp, query);
  }catch(err){ console.error("searchCity err", err); showError("Terjadi kesalahan saat memuat data (frontend)."); }
}

/* AI & alerts */
async function askAi(question, payload={}) {
  const body = { question, ...payload, units };
  const r = await postJson('/api/ai/chat', body);
  if (!r.ok) {
    console.error('/api/ai/chat error', r);
    return `Terjadi kesalahan saat memproses panggilan AI. (status: ${r.status || "network error"})`;
  }
  return r.data?.answer || "Tidak ada jawaban.";
}
async function fetchAlerts(payload={}) {
  const r = await postJson('/api/alerts', payload);
  if (!r.ok) return { error:true, message:`Gagal memeriksa alert (status: ${r.status || "network error"})`, data:r.data };
  return { error:false, alerts: r.data?.alerts || [] };
}

/* Inject AI widget */
(function injectAIWidget(){
  const wrap = document.getElementById("aiWidgetWrap");
  wrap.innerHTML = `
    <div style="background:#fff;padding:10px;border-radius:10px;box-shadow:var(--shadow)">
      <div style="font-weight:600;margin-bottom:6px">Tanya Asisten Cuaca</div>
      <textarea id="aiQuestion" rows="2" style="width:100%;border-radius:8px;padding:6px" placeholder="Mis: Perlukah payung besok pagi?"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="aiAskBtn" style="flex:1">Tanya</button>
        <button id="aiCheckAlerts" style="flex:1">Cek Alerts</button>
      </div>
      <div id="aiAnswer" style="margin-top:8px;color:var(--muted)">Tanyakan sesuatu untuk menerima rekomendasi.</div>
    </div>`;
  const aiAskBtn = document.getElementById("aiAskBtn");
  const aiQuestion = document.getElementById("aiQuestion");
  const aiAnswer = document.getElementById("aiAnswer");
  const aiCheckAlerts = document.getElementById("aiCheckAlerts");

  aiAskBtn.addEventListener("click", async ()=>{
    const q = aiQuestion.value.trim();
    if (!q) return;
    aiAnswer.textContent = "Memproses...";
    const payload = { city: cityEl.textContent && cityEl.textContent !== "—" ? cityEl.textContent : undefined };
    const ans = await askAi(q, payload);
    aiAnswer.textContent = ans;
  });
  aiCheckAlerts.addEventListener("click", async ()=>{
    aiAnswer.textContent = "Memeriksa alert...";
    const payload = { city: cityEl.textContent && cityEl.textContent !== "—" ? cityEl.textContent : undefined };
    const res = await fetchAlerts(payload);
    if (res.error) aiAnswer.textContent = res.message;
    else {
      const alerts = res.alerts;
      if (!alerts || alerts.length === 0) aiAnswer.textContent = "Tidak ada peringatan cuaca saat ini.";
      else aiAnswer.innerHTML = alerts.map(a=>`<strong>${a.title}</strong>: ${a.message}`).join("<br/>");
    }
  });
})();

/* initial load: try geolocation then fallback to Jakarta */
(async function init(){
  const q = input.value.trim() || "Jakarta";
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(async pos=>{
      const { latitude, longitude } = pos.coords;
      await searchCity(q); // still search by name so UI is consistent; map will update via coords in server response
    }, async ()=>{ await searchCity(q); });
  } else await searchCity(q);
})();
