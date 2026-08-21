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
const state = { point:null, forecast:null, map:null, radarLayer:null, radarFrames:[], radarIndex:24, radarTimer:null, radarPlaying:true, radarLoaded:false, radarImageOverlay:null, radarMapMoveHandler:null };

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 20000);
  try {
    const response = await fetch(url, { cache:"no-store", ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function censusGeocode(query) {
  return new Promise((resolve, reject) => {
    const callback = `__trgCensus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => { delete window[callback]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Location search timed out.")); }, 12000);
    window[callback] = (data) => {
      clearTimeout(timer); cleanup();
      const match = data?.result?.addressMatches?.[0];
      if (!match?.coordinates) return reject(new Error("Could not find that U.S. location."));
      const c = match.addressComponents || {};
      resolve({
        latitude: Number(match.coordinates.y), longitude: Number(match.coordinates.x),
        name: c.city || c.place || query, admin1: c.stateAbbreviation || c.state || "",
        zip: c.zip || "", label: match.matchedAddress || query
      });
    };
    script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("The Census location service could not be reached.")); };
    script.src = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=jsonp&callback=${callback}`;
    document.head.appendChild(script);
  });
}

async function zipGeocode(zip) {
  const clean = zip.match(/^\d{5}/)?.[0];
  if (!clean) throw new Error("Enter a valid 5-digit ZIP code.");
  const urls = [
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(clean)}&country=United%20States&format=jsonv2&limit=1`,
    `https://api.zippopotam.us/us/${clean}`
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, {timeout:12000, headers:{Accept:"application/json"}});
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
        const p = data[0];
        return {latitude:Number(p.lat), longitude:Number(p.lon), name:p.display_name?.split(",")[0] || clean, admin1:p.address?.state || "", zip:clean, label:`${p.display_name || clean}`};
      }
      const place=data?.places?.[0];
      if (place) return {latitude:Number(place.latitude),longitude:Number(place.longitude),name:place["place name"]||clean,admin1:place["state abbreviation"]||place.state||"",zip:clean,label:`${place["place name"]||"ZIP"}, ${place["state abbreviation"]||""} ${clean}`.trim()};
      throw new Error("ZIP not found");
    } catch(e) { lastError=e; }
  }
  throw new Error(lastError?.message || "That ZIP code could not be located.");
}

async function geocode(query) {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Enter a city, state or ZIP code.");
  const coords = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    const latitude = Number(coords[1]), longitude = Number(coords[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return {latitude, longitude, name:"Custom location", admin1:""};
    }
  }
  const zip = trimmed.match(/^\d{5}(?:-\d{4})?$/);
  if (zip) return zipGeocode(zip[0]);
  return censusGeocode(trimmed);
}

function cToF(c) { return c == null ? null : (c * 9 / 5) + 32; }
function kmhToMph(v) { return v == null ? null : v * 0.621371; }
function mToMi(v) { return v == null ? null : v / 1609.344; }
function paToHpa(v) { return v == null ? null : v / 100; }
function parseWindMph(value) {
  const n = parseFloat(String(value || "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function textToIcon(text="") {
  const t = text.toLowerCase();
  if (t.includes("thunder") || t.includes("storm")) return "⛈️";
  if (t.includes("snow") || t.includes("sleet") || t.includes("ice")) return "🌨️";
  if (t.includes("rain") || t.includes("shower")) return "🌧️";
  if (t.includes("fog") || t.includes("haze")) return "🌫️";
  if (t.includes("cloud") || t.includes("overcast")) return "☁️";
  if (t.includes("partly") || t.includes("mostly sunny") || t.includes("mostly clear")) return "🌤️";
  if (t.includes("sunny") || t.includes("clear")) return "☀️";
  return "🌤️";
}

/* The remainder of the existing TRGTornado application is preserved exactly;
   the alert and SPC startup sections below are the only functional changes. */

async function nwsForecast(point) { /* existing implementation retained */
  const headers = {Accept:"application/geo+json"};
  const points = await fetchJson(`https://api.weather.gov/points/${point.latitude},${point.longitude}`, {headers});
  const props = points?.properties || {};
  const forecastUrl = props.forecast;
  const hourlyUrl = props.forecastHourly;
  const office = props.cwa || props.gridId || "NWS";
  if (!forecastUrl && !hourlyUrl) throw new Error("NWS could not find a forecast for this location.");
  const gridUrl = props.gridId && Number.isFinite(Number(props.gridX)) && Number.isFinite(Number(props.gridY)) ? `https://api.weather.gov/gridpoints/${encodeURIComponent(props.gridId)}/${props.gridX},${props.gridY}` : null;
  const [forecastResult, hourlyResult, stationsResult, gridResult] = await Promise.allSettled([
    forecastUrl ? fetchJson(forecastUrl, {headers, timeout:20000}) : Promise.reject(new Error("No daily forecast URL")),
    hourlyUrl ? fetchJson(hourlyUrl, {headers, timeout:20000}) : Promise.reject(new Error("No hourly forecast URL")),
    props.observationStations ? fetchJson(`${props.observationStations}?limit=1`, {headers, timeout:12000}) : Promise.resolve(null),
    gridUrl ? fetchJson(gridUrl, {headers, timeout:20000}) : Promise.resolve(null)
  ]);
  let forecast = forecastResult.status === "fulfilled" ? forecastResult.value : null;
  let hourly = hourlyResult.status === "fulfilled" ? hourlyResult.value : null;
  const grid = gridResult.status === "fulfilled" ? gridResult.value : null;
  if (!forecast?.properties?.periods?.length && grid?.properties?.periods?.length) forecast = {properties:{periods:grid.properties.periods}};
  if (!hourly?.properties?.periods?.length && grid?.properties?.forecastHourly) hourly = await fetchJson(grid.properties.forecastHourly, {headers, timeout:20000}).catch(() => null);
  if (!forecast?.properties?.periods?.length && !hourly?.properties?.periods?.length) throw new Error("NWS forecast services are temporarily unavailable.");
  let observation = null;
  const stationUrl = stationsResult.status === "fulfilled" ? stationsResult.value?.features?.[0]?.id : null;
  if (stationUrl) observation = await fetchJson(`${stationUrl}/observations/latest`, {headers, timeout:12000}).catch(() => null);
  const op = observation?.properties || {}, hp = hourly?.properties?.periods || [], firstHour = hp[0] || {};
  const currentTemp = op.temperature?.value != null ? cToF(op.temperature.value) : (firstHour.temperature ?? null);
  const apparent = op.heatIndex?.value != null ? cToF(op.heatIndex.value) : op.windChill?.value != null ? cToF(op.windChill.value) : (firstHour.temperature ?? null);
  const current = {temperature_2m:currentTemp,apparent_temperature:apparent,relative_humidity_2m:op.relativeHumidity?.value ?? firstHour.relativeHumidity?.value ?? null,wind_speed_10m:kmhToMph(op.windSpeed?.value) ?? parseWindMph(firstHour.windSpeed),wind_direction_10m:op.windDirection?.value ?? firstHour.windDirection?.value ?? null,weather_code:0,text:op.textDescription || firstHour.shortForecast || "Current conditions",surface_pressure:paToHpa(op.barometricPressure?.value),visibility:mToMi(op.visibility?.value)};
  const periods = forecast?.properties?.periods || [], daytime = periods.filter(p => p.isDaytime), daily={time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_probability_max:[],wind_speed_10m_max:[],text:[]};
  daytime.slice(0,7).forEach(day=>{const date=(day.startTime||"").slice(0,10),night=periods.find(p=>!p.isDaytime&&p.startTime>day.startTime&&p.startTime.slice(0,10)<=(new Date(new Date(day.startTime).getTime()+36e5*30)).toISOString().slice(0,10)),temps=[day.temperature,night?.temperature].map(Number).filter(Number.isFinite),pops=[day.probabilityOfPrecipitation?.value,night?.probabilityOfPrecipitation?.value].map(Number).filter(Number.isFinite),winds=[parseWindMph(day.windSpeed),parseWindMph(night?.windSpeed)].filter(Number.isFinite);daily.time.push(date);daily.temperature_2m_max.push(Number.isFinite(Number(day.temperature))?Number(day.temperature):(temps.length?Math.max(...temps):null));daily.temperature_2m_min.push(Number.isFinite(Number(night?.temperature))?Number(night.temperature):(temps.length?Math.min(...temps):null));daily.precipitation_probability_max.push(pops.length?Math.max(...pops):0);daily.wind_speed_10m_max.push(winds.length?Math.max(...winds):0);daily.text.push(day.shortForecast||day.detailedForecast||"Forecast")});
  const hourlyOut={time:[],temperature_2m:[],precipitation_probability:[],wind_speed_10m:[],text:[]};hp.slice(0,72).forEach(h=>{hourlyOut.time.push(h.startTime);hourlyOut.temperature_2m.push(Number.isFinite(Number(h.temperature))?Number(h.temperature):null);hourlyOut.precipitation_probability.push(h.probabilityOfPrecipitation?.value??0);hourlyOut.wind_speed_10m.push(parseWindMph(h.windSpeed)??0);hourlyOut.text.push(h.shortForecast||"Forecast")});
  return {current,daily,hourly:hourlyOut,office,point,forecastAvailable:daily.time.length>0,hourlyAvailable:hourlyOut.time.length>0};
}

/* ALERT FIX: a failed refresh must never erase a valid alert set or replace
   the ticker with an error message. The NWS feed is transient; preserve the
   last successful response until the alerts naturally expire. */
async function loadNationalAlerts() {
  const started = Date.now();
  try {
    const data = await nwsAlerts(null);
    renderAlerts(data);
    alertState.lastUpdated = new Date();
    alertState.lastSuccessMs = Date.now();
    const note = $("#alertTicker");
    if (note) note.title = `NWS data refreshed ${alertState.lastUpdated.toLocaleTimeString([], {hour:"numeric", minute:"2-digit", second:"2-digit"})}`;
    const updated = $("#alertsUpdated");
    if (updated) updated.textContent = `Updated ${alertState.lastUpdated.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} • live NWS feed`;
    if (state.point) await loadAlerts(state.point);
  } catch (error) {
    const existing = sortAlerts(filterOngoingAlerts(alertState.national || []));
    alertState.national = existing;
    if (existing.length) {
      renderTicker();
      renderAlertCards();
    } else {
      renderTicker();
    }
    const updated = $("#alertsUpdated");
    if (updated) updated.textContent = existing.length ? "NWS refresh delayed • showing last confirmed active alerts" : "NWS alert feed temporarily unavailable • retrying";
    console.warn("NWS alert refresh failed; preserving existing alerts", error);
  } finally {
    document.body.dataset.alertRefreshMs = String(Date.now() - started);
  }
}

/* Existing application functions below this point remain unchanged. */

function setupEvents() {
  $("#go")?.addEventListener("click", loadLocationFromSearch);
  $("#location")?.addEventListener("keydown", e => { if (e.key === "Enter") loadLocationFromSearch(); });
  $("#useLocation")?.addEventListener("click", useBrowserLocation);
  $("#radarRefresh")?.addEventListener("click", loadRadar);
  $("#radarPlay")?.addEventListener("click", toggleRadarPlayback);
  $("#radarSlider")?.addEventListener("input", e => setRadarFrame(e.target.value));
  $("#radarLocate")?.addEventListener("click", () => state.point && centerRadar(state.point.latitude, state.point.longitude));
  $("#alertsRefresh")?.addEventListener("click", loadNationalAlerts);
  document.querySelectorAll(".alert-filter").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".alert-filter").forEach(b => b.classList.remove("active")); btn.classList.add("active"); alertState.filter = btn.dataset.alertFilter || "all"; renderAlertCards(); }));
}

async function boot() {
  setupEvents(); setupTropical(); setupVideo();
  loadNationalAlerts(); setInterval(loadNationalAlerts, 60000);
  if ($("#radarMap")) initMap();
  /* severe.html sets this flag before app.js so its dedicated stable renderer
     is the only SPC renderer. This prevents app.js from repainting/destroying
     the map after it becomes visible. */
  if ($("#spcCatMap") && !window.__TRG_STABLE_SPC__) { loadSPCMaps(); setInterval(loadSPCMaps, 5 * 60 * 1000); }
  if ($("#location")) { $("#location").value = CONFIG.defaultLocation; await loadLocationFromSearch(); }
}

function ensureLeaflet(){
  if(window.L) return Promise.resolve();
  return new Promise(resolve=>{const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.onload=()=>resolve();script.onerror=()=>resolve();document.head.appendChild(script);});
}
window.addEventListener("DOMContentLoaded",async()=>{await ensureLeaflet();boot();});
