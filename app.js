const $ = (s) => document.querySelector(s);

const CONFIG = {
  youtubeVideoId: "", // Add the ID from your YouTube live/video URL.
  defaultLocation: "Oklahoma City, OK",
  radarZoom: 5
};

const WEATHER_TEXT = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",56:"Freezing drizzle",57:"Freezing drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Heavy freezing rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Rain showers",81:"Rain showers",
  82:"Heavy showers",85:"Snow showers",86:"Heavy snow showers",95:"Thunderstorms",96:"Thunderstorms + hail",99:"Thunderstorms + hail"
};

const weatherIcon = (code) => code >= 95 ? "⛈️" : code >= 80 ? "🌦️" : code >= 61 ? "🌧️" : code >= 45 ? "☁️" : code <= 1 ? "☀️" : "🌤️";
const state = { point:null, forecast:null, map:null, radarLayer:null, radarFrames:[], radarIndex:0, radarTimer:null };

function setStatus(message, type="") {
  const el = $("#status");
  if (!el) return;
  el.textContent = message;
  el.className = type;
}

function imageFallback(img, label="Graphic unavailable") {
  img.style.display = "none";
  const fallback = img.parentElement?.querySelector(".image-fallback");
  if (fallback) {
    fallback.style.display = "grid";
    fallback.querySelector("strong")?.replaceChildren(document.createTextNode(label));
  }
}

async function fetchJson(url, options={}) {
  const response = await fetch(url, { cache:"no-store", ...options });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function geocode(query) {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Enter a city, state or ZIP code.");
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  const data = await fetchJson(url);
  if (!data.results?.length) throw new Error(`Could not find “${trimmed}”.`);
  return data.results[0];
}

async function reverseGeocode(latitude, longitude) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`;
  try {
    const data = await fetchJson(url);
    return data.results?.[0] || null;
  } catch { return null; }
}

async function openMeteo(point) {
  const params = new URLSearchParams({
    latitude: point.latitude,
    longitude: point.longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure,visibility",
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "7"
  });
  return fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
}

async function nwsAlerts(point) {
  return fetchJson(`https://api.weather.gov/alerts/active?point=${point.latitude},${point.longitude}`, {
    headers: { Accept:"application/geo+json" }
  });
}

function windDir(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return "--";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(degrees / 45) % 8];
}

function renderCurrent(data, point) {
  const c = data.current;
  $("#temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("#condition").textContent = WEATHER_TEXT[c.weather_code] || "Current conditions";
  $("#currentLocation").textContent = `${point.name}${point.admin1 ? `, ${point.admin1}` : ""}`;
  $("#feels").textContent = `Feels ${Math.round(c.apparent_temperature)}°`;
  $("#wind").textContent = `Wind ${Math.round(c.wind_speed_10m)} mph ${windDir(c.wind_direction_10m)}`;
  $("#humidity").textContent = `RH ${Math.round(c.relative_humidity_2m)}%`;
  $("#pressure").textContent = `Pressure ${Math.round(c.surface_pressure)} hPa`;
  $("#visibility").textContent = `Visibility ${Math.max(0, Math.round((c.visibility || 0) / 1609.344))} mi`;
}

function renderForecast(data) {
  const grid = $("#forecastGrid");
  if (!grid) return;
  grid.innerHTML = data.daily.time.map((date, i) => {
    const day = i === 0 ? "TODAY" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {weekday:"short"});
    return `<article class="day-card">
      <b>${day}</b><div class="weather-icon">${weatherIcon(data.daily.weather_code[i])}</div>
      <div class="temps">${Math.round(data.daily.temperature_2m_max[i])}° <span>${Math.round(data.daily.temperature_2m_min[i])}°</span></div>
      <div class="rain">💧 ${data.daily.precipitation_probability_max[i] ?? 0}%</div>
      <div class="desc">${WEATHER_TEXT[data.daily.weather_code[i]] || "Forecast"}</div>
      <div class="wind-small">💨 ${Math.round(data.daily.wind_speed_10m_max[i])} mph</div>
    </article>`;
  }).join("");
}

function renderHourly(data) {
  const now = new Date();
  let start = data.hourly.time.findIndex(t => new Date(t) >= now);
  if (start < 0) start = 0;
  const end = Math.min(start + 24, data.hourly.time.length);
  $("#hourlyGrid").innerHTML = data.hourly.time.slice(start, end).map((time, offset) => {
    const i = start + offset;
    return `<article class="hour-card">
      <b>${offset === 0 ? "NOW" : new Date(time).toLocaleTimeString(undefined,{hour:"numeric"})}</b>
      <div>${weatherIcon(data.hourly.weather_code[i])}</div>
      <strong>${Math.round(data.hourly.temperature_2m[i])}°</strong>
      <span>💧 ${data.hourly.precipitation_probability[i] ?? 0}%</span>
      <small>💨 ${Math.round(data.hourly.wind_speed_10m[i])} mph</small>
    </article>`;
  }).join("");
}

function alertClass(event="") {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "tornado";
  if (e.includes("severe thunderstorm")) return "severe";
  if (e.includes("warning")) return "warning";
  if (e.includes("watch")) return "watch";
  return "info";
}

function renderAlerts(data) {
  const box = $("#alertsBox");
  const features = data.features || [];
  const tag = $("#alertTag");
  tag.textContent = features.length ? `${features.length} ACTIVE` : "ALL CLEAR";
  tag.className = `tag ${features.length ? "red" : "green"}`;
  if (!features.length) {
    box.innerHTML = `<div class="empty"><strong>No active NWS alerts</strong><br><small>This point currently has no active watches, warnings or advisories returned by the NWS API.</small></div>`;
    return;
  }
  box.innerHTML = features.slice(0, 15).map(item => {
    const p = item.properties || {};
    const expires = p.expires ? new Date(p.expires).toLocaleString() : "";
    const href = p.web || item.id || "https://www.weather.gov/alerts";
    return `<a class="alert ${alertClass(p.event)}" href="${href}" target="_blank" rel="noopener">
      <div class="alert-icon">!</div><div><strong>${p.event || "Weather Alert"}</strong>
      <span>${p.headline || (p.description || "Active NWS alert").slice(0,220)}</span>
      ${expires ? `<small>Expires ${expires}</small>` : ""}</div>
    </a>`;
  }).join("");
}

async function loadAlerts(point) {
  try {
    renderAlerts(await nwsAlerts(point));
  } catch (error) {
    $("#alertTag").textContent = "UNAVAILABLE";
    $("#alertTag").className = "tag warning";
    $("#alertsBox").innerHTML = `<div class="empty"><strong>NWS alerts could not be loaded.</strong><br><small>${error.message}. Forecast data can still work normally.</small></div>`;
  }
}

async function loadLocation(point) {
  setStatus("Loading forecast…");
  try {
    const data = await openMeteo(point);
    state.point = point;
    state.forecast = data;
    renderCurrent(data, point);
    renderForecast(data);
    renderHourly(data);
    setStatus(`${point.name}${point.admin1 ? `, ${point.admin1}` : ""} • Updated ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}`);
    await loadAlerts(point);
    centerRadar(point.latitude, point.longitude);
  } catch (error) {
    setStatus(`Forecast error: ${error.message}`, "error");
  }
}

async function loadLocationFromSearch() {
  const button = $("#go");
  button.disabled = true;
  try {
    await loadLocation(await geocode($("#location").value));
  } catch (error) {
    setStatus(error.message || "Location search failed", "error");
  } finally { button.disabled = false; }
}

function useBrowserLocation() {
  if (!navigator.geolocation) return setStatus("Your browser does not support location services.", "error");
  setStatus("Requesting your location…");
  navigator.geolocation.getCurrentPosition(async ({coords}) => {
    const point = await reverseGeocode(coords.latitude, coords.longitude) || {
      latitude:coords.latitude, longitude:coords.longitude, name:"Your location"
    };
    $("#location").value = point.name || "Your location";
    await loadLocation(point);
  }, error => setStatus(`Location permission failed: ${error.message}`, "error"), {enableHighAccuracy:false, timeout:10000});
}

function initMap() {
  const mapEl = $("#radarMap");
  if (!window.L || !mapEl) {
    $("#radarStatus").textContent = "Interactive radar library failed to load.";
    mapEl?.classList.add("map-error");
    return;
  }
  state.map = L.map(mapEl, {zoomControl:true}).setView([35.4676,-97.5164], CONFIG.radarZoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:18,
    attribution:'© OpenStreetMap contributors'
  }).addTo(state.map);
  state.radarLayer = L.layerGroup().addTo(state.map);
  loadRadar();
}

async function loadRadar() {
  const status = $("#radarStatus");
  status.textContent = "Loading radar…";
  try {
    const data = await fetchJson("https://api.rainviewer.com/public/weather-maps.json");
    const frames = data.radar?.past || [];
    if (!data.host || !frames.length) throw new Error("No radar frames returned");
    state.radarFrames = frames;
    state.radarHost = data.host;
    state.radarIndex = frames.length - 1;
    renderRadarFrame();
    clearInterval(state.radarTimer);
    state.radarTimer = setInterval(() => {
      state.radarIndex = (state.radarIndex + 1) % state.radarFrames.length;
      renderRadarFrame();
    }, 1200);
    status.innerHTML = `Radar animation • ${frames.length} past frames • <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>`;
  } catch (error) {
    status.textContent = `Radar unavailable: ${error.message}`;
  }
}

function renderRadarFrame() {
  if (!state.radarLayer || !state.radarFrames.length) return;
  state.radarLayer.clearLayers();
  const frame = state.radarFrames[state.radarIndex];
  const tileUrl = `${state.radarHost}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;
  L.tileLayer(tileUrl, {
    tileSize:512, zoomOffset:-1, opacity:0.78, maxNativeZoom:7, maxZoom:12,
    attribution:'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
  }).addTo(state.radarLayer);
}

function centerRadar(lat, lon) {
  if (state.map) state.map.setView([lat, lon], CONFIG.radarZoom);
}

const tropicalProducts = {
  atl:{title:"ATLANTIC 7-DAY OUTLOOK", img:"https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png", head:"Atlantic Tropical Outlook", text:"Monitor the Atlantic basin for tropical waves, areas of development and active tropical cyclones."},
  epac:{title:"EASTERN PACIFIC 7-DAY OUTLOOK", img:"https://www.nhc.noaa.gov/xgtwo/two_epac_7d0.png", head:"Eastern Pacific Outlook", text:"Monitor the eastern Pacific for tropical development and active systems."},
  cpac:{title:"CENTRAL PACIFIC 7-DAY OUTLOOK", img:"https://www.nhc.noaa.gov/xgtwo/two_cpac_7d0.png", head:"Central Pacific Outlook", text:"Monitor the central Pacific for tropical development and active systems."}
};

function showTropical(key) {
  const product = tropicalProducts[key];
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tropical === key));
  const image = $("#tropicalImage");
  const fallback = image.parentElement.querySelector(".image-fallback");
  image.src = product.img;
  image.style.display = "block";
  if (fallback) fallback.style.display = "none";
  $("#tropicalTitle").textContent = product.title;
  $("#tropicalHeadline").textContent = product.head;
  $("#tropicalText").textContent = product.text;
}

function setupTropical() {
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showTropical(btn.dataset.tropical)));
  showTropical("atl");
}

function setupVideo() {
  const frame = $("#youtubeFrame");
  const placeholder = $("#videoPlaceholder");
  if (!CONFIG.youtubeVideoId) return;
  frame.src = `https://www.youtube.com/embed/${encodeURIComponent(CONFIG.youtubeVideoId)}?autoplay=0&rel=0`;
  frame.style.display = "block";
  placeholder.style.display = "none";
  $("#youtubeLink").href = `https://www.youtube.com/watch?v=${encodeURIComponent(CONFIG.youtubeVideoId)}`;
}

function setupEvents() {
  $("#go").addEventListener("click", loadLocationFromSearch);
  $("#location").addEventListener("keydown", e => { if (e.key === "Enter") loadLocationFromSearch(); });
  $("#useLocation").addEventListener("click", useBrowserLocation);
  $("#radarRefresh").addEventListener("click", loadRadar);
  $("#radarLocate").addEventListener("click", () => state.point && centerRadar(state.point.latitude, state.point.longitude));
}

async function boot() {
  setupEvents();
  setupTropical();
  setupVideo();
  initMap();
  $("#location").value = CONFIG.defaultLocation;
  await loadLocationFromSearch();
}

window.addEventListener("DOMContentLoaded", boot);
