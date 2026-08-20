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

async function nwsForecast(point) {
  const points = await fetchJson(`https://api.weather.gov/points/${point.latitude},${point.longitude}`, {headers:{Accept:"application/geo+json"}});
  const props = points.properties || {};
  const gridId = props.gridId, gridX = props.gridX, gridY = props.gridY;
  if (!gridId || gridX == null || gridY == null) throw new Error("NWS could not find a forecast grid for this location.");
  const base = `https://api.weather.gov/gridpoints/${encodeURIComponent(gridId)}/${gridX},${gridY}`;
  const forecastUrl = `${base}/forecast`;
  const hourlyUrl = `${base}/forecast/hourly`;
  const obsStationsUrl = props.observationStations;

  const [forecastResult, hourlyResult, stationsResult] = await Promise.allSettled([
    fetchJson(forecastUrl, {headers:{Accept:"application/geo+json"}}),
    fetchJson(hourlyUrl, {headers:{Accept:"application/geo+json"}}),
    obsStationsUrl ? fetchJson(`${obsStationsUrl}?limit=1`, {headers:{Accept:"application/geo+json"}}) : Promise.resolve(null)
  ]);
  if (forecastResult.status !== "fulfilled" && hourlyResult.status !== "fulfilled") {
    throw new Error("NWS forecast services are temporarily unavailable.");
  }
  const forecast = forecastResult.status === "fulfilled" ? forecastResult.value : {features:[]};
  const hourly = hourlyResult.status === "fulfilled" ? hourlyResult.value : {features:[]};

  let observation = null;
  const stationUrl = stationsResult.status === "fulfilled" ? stationsResult.value?.features?.[0]?.id : null;
  if (stationUrl) observation = await fetchJson(`${stationUrl}/observations/latest`, {headers:{Accept:"application/geo+json"}}).catch(() => null);

  const op = observation?.properties || {};
  const hp = hourly.features?.map(f => f.properties || {}) || [];
  const firstHour = hp[0] || {};
  const currentTemp = op.temperature?.value != null ? cToF(op.temperature.value) : (firstHour.temperature?.value ?? null);
  const apparent = op.heatIndex?.value != null ? cToF(op.heatIndex.value) : op.windChill?.value != null ? cToF(op.windChill.value) : (firstHour.temperature?.value ?? null);
  const current = {
    temperature_2m: currentTemp,
    apparent_temperature: apparent,
    relative_humidity_2m: op.relativeHumidity?.value ?? firstHour.relativeHumidity?.value ?? null,
    wind_speed_10m: kmhToMph(op.windSpeed?.value) ?? parseWindMph(firstHour.windSpeed),
    wind_direction_10m: op.windDirection?.value ?? firstHour.windDirection?.value ?? null,
    weather_code: 0,
    text: op.textDescription || firstHour.shortForecast || "Current conditions",
    surface_pressure: paToHpa(op.barometricPressure?.value),
    visibility: mToMi(op.visibility?.value)
  };

  const periods = forecast.features?.map(f => f.properties || {}) || [];
  const groups = new Map();
  periods.forEach(period => {
    const date = (period.startTime || "").slice(0,10);
    if (!date) return;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(period);
  });
  const daily = {time:[], weather_code:[], temperature_2m_max:[], temperature_2m_min:[], precipitation_probability_max:[], wind_speed_10m_max:[], text:[]};
  [...groups.entries()].slice(0,7).forEach(([date, ps]) => {
    const day = ps.find(x => x.isDaytime) || ps[0];
    const temps = ps.map(x => Number(x.temperature)).filter(Number.isFinite);
    const pops = ps.map(x => Number(x.probabilityOfPrecipitation?.value)).filter(Number.isFinite);
    const winds = ps.map(x => parseWindMph(x.windSpeed)).filter(Number.isFinite);
    daily.time.push(date);
    daily.weather_code.push(0);
    daily.temperature_2m_max.push(temps.length ? Math.max(...temps) : null);
    daily.temperature_2m_min.push(temps.length ? Math.min(...temps) : null);
    daily.precipitation_probability_max.push(pops.length ? Math.max(...pops) : 0);
    daily.wind_speed_10m_max.push(winds.length ? Math.max(...winds) : 0);
    daily.text.push(day?.shortForecast || day?.detailedForecast || "Forecast");
  });

  const hourlyOut = {time:[], weather_code:[], temperature_2m:[], precipitation_probability:[], wind_speed_10m:[], text:[]};
  hp.slice(0,48).forEach(h => {
    hourlyOut.time.push(h.startTime);
    hourlyOut.weather_code.push(0);
    hourlyOut.temperature_2m.push(Number.isFinite(Number(h.temperature?.value)) ? Number(h.temperature.value) : null);
    hourlyOut.precipitation_probability.push(h.probabilityOfPrecipitation?.value ?? 0);
    hourlyOut.wind_speed_10m.push(parseWindMph(h.windSpeed) ?? 0);
    hourlyOut.text.push(h.shortForecast || "Forecast");
  });
  return {current, daily, hourly:hourlyOut, office:props.cwa || gridId || "NWS", point, forecastAvailable:periods.length>0, hourlyAvailable:hp.length>0};
}

function windDir(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return "--";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(degrees / 45) % 8];
}

function renderCurrent(data, point) {
  const c = data.current;
  $("#temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("#condition").textContent = c.text || "Current conditions";
  $("#currentLocation").textContent = `${point.name}${point.admin1 ? `, ${point.admin1}` : ""}`;
  $("#feels").textContent = `Feels ${Math.round(c.apparent_temperature)}°`;
  $("#wind").textContent = `Wind ${Math.round(c.wind_speed_10m)} mph ${windDir(c.wind_direction_10m)}`;
  $("#humidity").textContent = `RH ${Math.round(c.relative_humidity_2m)}%`;
  $("#pressure").textContent = c.surface_pressure != null ? `Pressure ${Math.round(c.surface_pressure)} hPa` : "Pressure --";
  $("#visibility").textContent = c.visibility != null ? `Visibility ${Math.max(0, Math.round(c.visibility))} mi` : "Visibility --";
}

function renderForecast(data) {
  const grid = $("#forecastGrid");
  if (!grid) return;
  grid.innerHTML = data.daily.time.map((date, i) => {
    const day = i === 0 ? "TODAY" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {weekday:"short"});
    return `<article class="day-card">
      <b>${day}</b><div class="weather-icon">${textToIcon(data.daily.text?.[i] || "")}</div>
      <div class="temps">${Number.isFinite(data.daily.temperature_2m_max[i]) ? Math.round(data.daily.temperature_2m_max[i]) : "--"}° <span>${Number.isFinite(data.daily.temperature_2m_min[i]) ? Math.round(data.daily.temperature_2m_min[i]) : "--"}°</span></div>
      <div class="rain">💧 ${data.daily.precipitation_probability_max[i] ?? 0}%</div>
      <div class="desc">${escapeHtml(data.daily.text?.[i] || "Forecast")}</div>
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
      <div>${textToIcon(data.hourly.text?.[i] || "")}</div>
      <strong>${data.hourly.temperature_2m[i] == null ? "--" : Math.round(data.hourly.temperature_2m[i])}°</strong>
      <span>💧 ${data.hourly.precipitation_probability[i] ?? 0}%</span>
      <small>💨 ${Math.round(data.hourly.wind_speed_10m[i])} mph</small>
    </article>`;
  }).join("");
}

async function reverseGeocode(latitude, longitude) {
  // Keep browser-location use simple and privacy-friendly. We do not send the
  // user's precise location to a third-party geocoder just to label the point.
  return { latitude, longitude, name: "Your location", admin1: "" };
}

async function nwsAlerts(point) {
  // NWS /alerts/active is the primary live alert source. NWS documents this
  // endpoint specifically for currently active/ongoing alerts. We also query
  // the official NOAA WWA GIS layer as a secondary source and merge results.
  const apiUrl = point
    ? `https://api.weather.gov/alerts/active?point=${encodeURIComponent(point.latitude)},${encodeURIComponent(point.longitude)}&limit=500&_trg=${Date.now()}`
    : `https://api.weather.gov/alerts/active?limit=500&_trg=${Date.now()}`;

  const gisUrl = (layer) => {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "prod_type,msg_type,phenom,url,expiration,onset,ends,issuance,wfo,event,cap_id,sig,idp_ingestdate",
      returnGeometry: "false", f: "json", resultRecordCount: "4000",
      orderByFields: "expiration ASC", _trg: String(Date.now())
    });
    return `https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer/${layer}/query?${params}`;
  };

  const normalizeNws = (features=[]) => features.map((item, i) => {
    const p = item.properties || {};
    return {
      id: item.id || p.id || `nws-${i}-${p.sent || p.effective || ""}`,
      properties: {
        ...p,
        event: p.event || "Weather Alert",
        headline: p.headline || p.description || p.event || "Weather Alert",
        areaDesc: p.areaDesc || "Active NWS area",
        web: p.web || item.id || "https://www.weather.gov/alerts",
        status: p.status || "Actual",
        messageType: p.messageType || "Alert"
      },
      geometry: item.geometry || null
    };
  }).filter(isOngoingAlert);

  const normalizeGis = (data, layer) => (Array.isArray(data?.features) ? data.features : []).map((f, i) => {
    const a = f.attributes || {};
    const event = String(a.prod_type || hazardName(a.phenom, a.sig) || a.event || "Weather Alert").trim();
    const effective = a.onset || a.issuance || null;
    const expires = a.expiration || a.ends || null;
    return {
      id: a.cap_id || `${layer}-${a.wfo || "NWS"}-${a.phenom || ""}-${a.sig || ""}-${a.issuance || a.idp_ingestdate || i}`,
      properties: {
        event, headline: event, areaDesc: "", effective, onset: a.onset || effective,
        expires, ends: a.ends || expires, sent: a.issuance || effective,
        severity: severityForPhenomena(a.phenom), urgency: "Immediate", certainty: "Observed",
        web: a.url || "https://www.weather.gov/alerts", status: "Actual",
        messageType: a.msg_type || "Alert", phenom: a.phenom, sig: a.sig, wfo: a.wfo,
        ingest: a.idp_ingestdate || null
      }
    };
  }).filter(isOngoingAlert);

  const results = await Promise.allSettled([
    fetchJson(apiUrl, {timeout:15000, headers:{Accept:"application/geo+json"}}),
    fetchJson(gisUrl(0), {timeout:15000}),
    fetchJson(gisUrl(1), {timeout:15000})
  ]);

  const merged = new Map();
  let successful = 0;
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    successful++;
    const items = index === 0
      ? normalizeNws(result.value.features || [])
      : normalizeGis(result.value, index - 1);
    items.forEach(item => merged.set(String(item.id), item));
  });

  if (!successful) throw new Error("All NWS alert sources failed");
  return {features:[...merged.values()]};
}
function hazardName(phenom, sig) {
  const key = `${phenom || ""},${sig || ""}`;
  const names = {
    "TO,W":"Tornado Warning", "SV,W":"Severe Thunderstorm Warning",
    "FF,W":"Flash Flood Warning", "EW,W":"Extreme Wind Warning",
    "TO,A":"Tornado Watch", "SV,A":"Severe Thunderstorm Watch",
    "FF,A":"Flash Flood Watch", "HU,W":"Hurricane Warning", "HU,A":"Hurricane Watch",
    "TR,W":"Tropical Storm Warning", "TR,A":"Tropical Storm Watch"
  };
  return names[key] || "Weather Alert";
}

function severityForPhenomena(phenom) {
  return ["TO","SV","EW","HU"].includes(String(phenom || "")) ? "Severe" : "Moderate";
}

function isOngoingAlert(item, now = Date.now()) {
  const p = item?.properties || {};
  const status = String(p.status || "").toLowerCase();
  const msgType = String(p.messageType || "").toLowerCase();
  if (status && status !== "actual") return false;
  if (msgType && msgType === "cancel") return false;
  const effective = Date.parse(p.effective || p.onset || 0);
  const expires = Date.parse(p.expires || p.ends || 0);
  if (Number.isFinite(effective) && effective > now) return false;
  if (Number.isFinite(expires) && expires <= now) return false;
  return true;
}

function filterOngoingAlerts(features) {
  return (features || []).filter(item => isOngoingAlert(item));
}

const alertState = {
  national: [],
  local: [],
  filter: "all",
  lastUpdated: null,
  tickerTimer: null,
  tickerSignature: ""
};

const ALERT_EVENT_PRIORITY = [
  ["tornado emergency", 140], ["tornado warning", 130], ["hurricane warning", 125],
  ["storm surge warning", 125], ["flash flood warning", 120], ["flash flood emergency", 135],
  ["severe thunderstorm warning", 115], ["extreme wind warning", 115], ["ice storm warning", 108],
  ["blizzard warning", 108], ["winter storm warning", 105], ["dust storm warning", 100],
  ["flood warning", 98], ["high wind warning", 95], ["red flag warning", 92],
  ["tornado watch", 78], ["hurricane watch", 76], ["storm surge watch", 76],
  ["severe thunderstorm watch", 74], ["flood watch", 70], ["winter storm watch", 68],
  ["special weather statement", 35]
];

function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

function eventScore(event="") {
  const e = event.toLowerCase();
  const match = ALERT_EVENT_PRIORITY.find(([name]) => e.includes(name));
  return match ? match[1] : 50;
}

function alertPriority(item) {
  const p = item.properties || {};
  const severity = {Extreme: 45, Severe: 35, Moderate: 25, Minor: 15, Unknown: 5}[p.severity] ?? 5;
  const urgency = {Immediate: 30, Expected: 20, Future: 10, Unknown: 0}[p.urgency] ?? 0;
  const certainty = {Observed: 15, Likely: 12, Possible: 6, Unlikely: 2, Unknown: 0}[p.certainty] ?? 0;
  return eventScore(p.event) + severity + urgency + certainty;
}

function alertType(event="") {
  const e = event.toLowerCase();
  if (e.includes("warning") || e.includes("emergency")) return "warning";
  if (e.includes("watch")) return "watch";
  if (e.includes("statement")) return "statement";
  return "advisory";
}

function sortAlerts(features) {
  return [...(features || [])].sort((a,b) => {
    const scoreDiff = alertPriority(b) - alertPriority(a);
    if (scoreDiff) return scoreDiff;
    const ae = new Date(a.properties?.expires || 0).getTime();
    const be = new Date(b.properties?.expires || 0).getTime();
    return ae - be;
  });
}

function alertShortLabel(p) {
  const event = p.event || "Weather Alert";
  const areas = (p.areaDesc || "").split(";").map(x => x.trim()).filter(Boolean);
  const area = areas.length ? areas.slice(0,2).join(" • ") : "Active area";
  return `${event} — ${area}`;
}

function alertRemaining(expires) {
  const ms=Date.parse(expires||"")-Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms<=0) return "EXPIRED";
  const minutes=Math.floor(ms/60000);
  if (minutes<60) return `${Math.max(1,minutes)} MIN LEFT`;
  return `${Math.floor(minutes/60)}H ${String(minutes%60).padStart(2,"0")}M LEFT`;
}
function alertBadgeClass(event="") {
  const e=event.toLowerCase();
  if(e.includes("tornado emergency")||e.includes("flash flood emergency")) return "emergency";
  if(e.includes("tornado warning")) return "tornado";
  if(e.includes("flash flood warning")) return "flash";
  if(e.includes("severe thunderstorm warning")||e.includes("extreme wind warning")) return "severe";
  if(e.includes("warning")) return "warning";
  if(e.includes("watch")) return "watch";
  return "advisory";
}
function alertAreaLabel(p) {
  const areas=(p.areaDesc||"").split(";").map(x=>x.trim()).filter(Boolean);
  if (areas.length) return areas.slice(0,3).join(" • ");
  return p.wfo ? `NWS ${p.wfo} AREA` : "ACTIVE NWS AREA";
}
function tickerSignature(items) {
  return items.map(x=>`${x.id}|${x.properties?.event}|${x.properties?.expires}`).join("||");
}

function renderTicker() {
  const track=$("#alertTickerTrack"); if(!track) return;
  const top=sortAlerts(alertState.national).slice(0,12);
  if(!top.length){
    track.innerHTML='<span class="ticker-item ticker-clear"><span class="ticker-badge">ALL CLEAR</span> No active NWS warnings or watches in the current feed.</span>';
    track.style.removeProperty("--ticker-distance"); return;
  }
  const signature=tickerSignature(top);
  const changed=signature!==alertState.tickerSignature;
  alertState.tickerSignature=signature;
  const build=(items)=>items.map((item,index)=>{
    const p=item.properties||{}, type=alertBadgeClass(p.event), remaining=alertRemaining(p.expires);
    const fresh=changed&&index===0?'<span class="ticker-new">NEW</span>':"";
    return `<button class="ticker-item ${type}" type="button" data-alert-id="${escapeHtml(item.id||"")}">${fresh}<span class="ticker-badge">${escapeHtml(p.event||"WEATHER ALERT")}</span><span class="ticker-area">${escapeHtml(alertAreaLabel(p))}</span>${remaining?`<span class="ticker-time">${escapeHtml(remaining)}</span>`:""}</button>`;
  }).join('<span class="ticker-separator">•</span>');
  track.innerHTML=build(top)+'<span class="ticker-separator ticker-loop-gap">•</span>'+build(top);
  requestAnimationFrame(()=>track.style.setProperty("--ticker-distance",`${Math.max(track.scrollWidth/2,900)}px`));
  track.querySelectorAll(".ticker-item[data-alert-id]").forEach(btn=>btn.addEventListener("click",()=>{
    const target=alertState.national.find(x=>String(x.id)===String(btn.dataset.alertId));
    const url=target?.properties?.web;
    if(url) window.open(url,"_blank","noopener"); else window.location.href="alerts.html";
  }));
}

function renderAlertCards() {
  const box = $("#alertsBox");
  if (!box) return;
  const filtered = sortAlerts(alertState.national).filter(item => alertState.filter === "all" || alertType(item.properties?.event) === alertState.filter);
  const top = filtered.slice(0, 40);
  if (!top.length) {
    box.innerHTML = `<div class="empty"><strong>No ${alertState.filter === "all" ? "active" : alertState.filter} alerts found.</strong><br><small>The NWS active feed currently has nothing matching this filter.</small></div>`;
    return;
  }
  box.innerHTML = top.map((item, index) => {
    const p = item.properties || {};
    const expires = p.expires ? new Date(p.expires).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : "Unknown";
    const issued = p.sent || p.effective || p.onset;
    const issuedText = issued ? new Date(issued).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : "Unknown";
    const href = /^https:\/\//i.test(p.web || "") ? p.web : "https://www.weather.gov/alerts";
    const cls = alertClass(p.event);
    const type = alertType(p.event);
    const severity = p.severity || "Unknown";
    const urgency = p.urgency || "Unknown";
    return `<a class="alert ${cls}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">\n      <div class="alert-rank">${index + 1}</div><div class="alert-icon">${type === "warning" ? "!" : type === "watch" ? "W" : "i"}</div>\n      <div class="alert-body"><div class="alert-title-row"><strong>${escapeHtml(p.event || "Weather Alert")}</strong><span class="alert-priority">${escapeHtml(severity)} • ${escapeHtml(urgency)}</span></div>\n      <span>${escapeHtml(p.headline || alertShortLabel(p))}</span>\n      <small>${escapeHtml((p.areaDesc || "Active NWS area").split(";").slice(0,3).join(" • "))} · Issued ${escapeHtml(issuedText)} · Expires ${escapeHtml(expires)}</small></div>\n    </a>`;
  }).join("");
}

function renderAlerts(data) {
  const features = filterOngoingAlerts(data.features || []);
  alertState.national = sortAlerts(features);
  const tag = $("#alertTag");
  if (tag) {
    tag.textContent = features.length ? `${features.length} ACTIVE` : "ALL CLEAR";
    tag.className = `tag ${features.length ? "red" : "green"}`;
  }
  $("#alertCount") && ($("#alertCount").textContent = features.length);
  renderTicker();
  renderAlertCards();
}

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
    const staleFor = alertState.lastSuccessMs ? Date.now() - alertState.lastSuccessMs : Infinity;
    // Never let old warnings sit on the public page indefinitely. After 2
    // minutes without a successful refresh, clear the old feed entirely.
    if (staleFor > 120000) {
      alertState.national = [];
      renderTicker();
      const box = $("#alertsBox");
      if (box) box.innerHTML = `<div class="empty"><strong>NWS alert feed temporarily unavailable.</strong><br><small>No stale alerts are being displayed. The site will keep retrying automatically.</small></div>`;
      const tag = $("#alertTag");
      if (tag) { tag.textContent = "FEED OFFLINE"; tag.className = "tag warning"; }
      $("#alertCount") && ($("#alertCount").textContent = "0");
      $("#localAlertCount") && ($("#localAlertCount").textContent = "--");
    }
    const track = $("#alertTickerTrack");
    if (track) track.innerHTML = `<span class="ticker-item ticker-error">NWS alert refresh failed — retrying automatically.</span>`;
    const updated = $("#alertsUpdated");
    if (updated) updated.textContent = "NWS feed temporarily unavailable • retrying";
    console.warn("NWS alert refresh failed", error);
  } finally {
    const ms = Date.now() - started;
    document.body.dataset.alertRefreshMs = String(ms);
  }
}

function alertClass(event="") {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "tornado";
  if (e.includes("severe thunderstorm")) return "severe";
  if (e.includes("warning")) return "warning";
  if (e.includes("watch")) return "watch";
  if (e.includes("statement")) return "statement";
  return "info";
}

async function loadAlerts(point) {
  try {
    const data = await nwsAlerts(point);
    alertState.local = filterOngoingAlerts(data.features || []);
    const local = $("#localAlertCount");
    if (local) local.textContent = alertState.local.length;
    // National alert ranking remains the primary alert center. Local alerts are still shown as a count.
  } catch {
    const local = $("#localAlertCount");
    if (local) local.textContent = "--";
  }
}

async function loadLocation(point) {
  setStatus("Loading NWS forecast…");
  try {
    const data = await nwsForecast(point);
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
  state.map = L.map(mapEl, {zoomControl:true, preferCanvas:true}).setView([35.4676,-97.5164], CONFIG.radarZoom);
  L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {
    maxZoom:16,
    attribution:'Map services and data available from U.S. Geological Survey, National Geospatial Program.'
  }).addTo(state.map);
  state.radarLayer = L.layerGroup().addTo(state.map);
  loadRadar();
}

const NOAA_RADAR_MAPSERVER = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer";
let radarExportTimer = null;

function radarExportUrl(bounds, width, height) {
  const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
  const project = (lat, lon) => {
    const x = lon * 20037508.34 / 180;
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    return {x, y: y * 20037508.34 / 180};
  };
  const a = project(sw.lat, sw.lng), b = project(ne.lat, ne.lng);
  const bbox = `${a.x},${a.y},${b.x},${b.y}`;
  const params = new URLSearchParams({
    bbox, bboxSR:"3857", imageSR:"3857", size:`${Math.max(600,Math.min(1600,width))},${Math.max(400,Math.min(1000,height))}`,
    format:"png32", transparent:"true", layers:"show:3", f:"image", dpi:"96"
  });
  return `${NOAA_RADAR_MAPSERVER}/export?${params.toString()}`;
}

function updateRadarImage() {
  if (!state.map) return;
  const status=$("#radarStatus");
  const bounds=state.map.getBounds();
  const size=state.map.getSize();
  const url=radarExportUrl(bounds, size.x*window.devicePixelRatio, size.y*window.devicePixelRatio);
  const overlayBounds=bounds.pad(0.01);
  const img=new Image();
  img.onload=()=>{
    if (state.radarImageOverlay) state.map.removeLayer(state.radarImageOverlay);
    state.radarImageOverlay=L.imageOverlay(url, overlayBounds, {opacity:.82, interactive:false, crossOrigin:true, attribution:"NOAA/NWS MRMS"}).addTo(state.map);
    state.radarLoaded=true;
    if(status) status.textContent="Live NOAA MRMS radar • current composite • refreshes every 5 minutes";
  };
  img.onerror=()=>{ if(status) status.textContent="NOAA radar image could not be loaded. Try Refresh."; };
  img.src=url;
}

function loadRadar() {
  const status=$("#radarStatus"); if (!status || !state.map) return;
  status.textContent="Loading live NOAA radar…";
  updateRadarImage();
  if (!state.radarMapMoveHandler) {
    state.radarMapMoveHandler=()=>{
      clearTimeout(radarExportTimer);
      radarExportTimer=setTimeout(updateRadarImage,450);
    };
    state.map.on("moveend zoomend resize", state.radarMapMoveHandler);
  }
  clearInterval(state.radarTimer);
  state.radarTimer=setInterval(updateRadarImage,300000);
}

function toggleRadarPlayback() {}
function setRadarFrame() {}

function centerRadar(lat, lon) {
  if (state.map) state.map.setView([lat, lon], CONFIG.radarZoom);
}


const SPC = {
  base: "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/FeatureServer",
  mapServer: "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer",
  layers: { categorical:1, tornado:3, tornadoCig:2, hail:5, wind:7 },
  maps: {}
};

function spcStyle(feature) {
  const p = feature?.properties || {};
  const fill = p.fill || p.FILL || "#6ba66b";
  const stroke = p.stroke || p.STROKE || "#1b5e20";
  return { color: stroke, weight: 1.5, fillColor: fill, fillOpacity: 0.72 };
}

function spcPopup(feature) {
  const p = feature?.properties || {};
  const label = p.label || p.label2 || p.dn || "Outlook area";
  const valid = p.valid || "";
  return `<strong>${label}</strong>${valid ? `<br><small>${valid}</small>` : ""}`;
}

async function loadSpcLayer(key, mapId, statusId, label) {
  const mapEl = document.getElementById(mapId), status = document.getElementById(statusId);
  if (!mapEl || !window.L) return;
  let map = SPC.maps[mapId];
  if (!map) {
    map = L.map(mapEl, {zoomControl:false, attributionControl:false, dragging:true, scrollWheelZoom:true, doubleClickZoom:true, touchZoom:true}).setView([38,-96],4);
    L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {maxZoom:8, attribution:"USGS"}).addTo(map);
    SPC.maps[mapId]=map;
  }
  status.textContent=`Loading live ${label}…`;
  try {
    const b=map.getBounds(), size=map.getSize();
    const bbox=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(",");
    const url=`${SPC.mapServer}/export?bbox=${encodeURIComponent(bbox)}&bboxSR=4326&imageSR=4326&size=${Math.max(640,Math.min(1400,size.x))},${Math.max(360,Math.min(900,size.y))}&format=png32&transparent=true&dpi=96&layers=show:${SPC.layers[key]}&f=image&cacheBust=${Date.now()}`;
    const img=new Image(); img.crossOrigin="anonymous";
    img.onload=()=>{
      if(map._spcImage) map.removeLayer(map._spcImage);
      map._spcImage=L.imageOverlay(url, [[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]], {opacity:.82, interactive:false}).addTo(map);
      status.innerHTML=`Live NOAA/SPC ${label} • refreshed ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} • <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open SPC</a>`;
    };
    img.onerror=()=>{throw new Error("SPC image export failed")};
    img.src=url;
  } catch(error) {
    status.innerHTML=`${label} unavailable right now. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open official SPC</a>`;
    mapEl.classList.add("map-error");
  }
}

function loadSPCMaps() {
  loadSpcLayer("categorical", "spcCatMap", "spcCatStatus", "SPC categorical outlook");
  loadSpcLayer("tornado", "spcTornMap", "spcTornStatus", "tornado probability");
  loadSpcLayer("tornadoCig", "spcTornCigMap", "spcTornCigStatus", "tornado conditional intensity (CIG)");
  loadSpcLayer("wind", "spcWindMap", "spcWindStatus", "wind probability");
  loadSpcLayer("hail", "spcHailMap", "spcHailStatus", "hail probability");
}

const tropicalProducts = {
  atl:{title:"ATLANTIC 7-DAY OUTLOOK", frame:"https://www.nhc.noaa.gov/archive/xgtwo/gtwo_archive.php?basin=atl&fdays=7", head:"Atlantic Tropical Outlook", text:"Current NHC Atlantic 7-day graphical outlook."},
  epac:{title:"EASTERN PACIFIC 7-DAY OUTLOOK", frame:"https://www.nhc.noaa.gov/archive/xgtwo/gtwo_archive.php?basin=epac&fdays=7", head:"Eastern Pacific Outlook", text:"Current NHC Eastern Pacific 7-day graphical outlook."},
  cpac:{title:"CENTRAL PACIFIC 7-DAY OUTLOOK", frame:"https://www.nhc.noaa.gov/archive/xgtwo/gtwo_archive.php?basin=cpac&fdays=7", head:"Central Pacific Outlook", text:"Current NHC Central Pacific 7-day graphical outlook."},
  wpac:{title:"JTWC WESTERN PACIFIC", frame:"https://www.metoc.navy.mil/jtwc/jtwc.html", head:"JTWC Western Pacific", text:"Current official JTWC tropical products and Western Pacific warnings."}
};
const TROPICAL_REFRESH_MS = 5 * 60 * 1000;

const tropicalViewer = { scale:1, x:0, y:0, dragging:false, sx:0, sy:0, ox:0, oy:0 };

function applyTropicalTransform() {
  const image = $("#tropicalImage");
  if (!image) return;
  image.style.transform = `translate(${tropicalViewer.x}px, ${tropicalViewer.y}px) scale(${tropicalViewer.scale})`;
}

function resetTropicalZoom() {
  tropicalViewer.scale = 1; tropicalViewer.x = 0; tropicalViewer.y = 0;
  applyTropicalTransform();
}

function zoomTropical(delta, cx=null, cy=null) {
  const viewport = $("#tropicalViewer");
  const image = $("#tropicalImage");
  if (!viewport || !image) return;
  const old = tropicalViewer.scale;
  const next = Math.max(1, Math.min(5, old * delta));
  if (next === old) return;
  if (cx != null && cy != null) {
    const rect = viewport.getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    tropicalViewer.x = px - (px - tropicalViewer.x) * (next / old);
    tropicalViewer.y = py - (py - tropicalViewer.y) * (next / old);
  }
  tropicalViewer.scale = next;
  applyTropicalTransform();
}

function setupTropicalViewer() {
  const viewport = $("#tropicalViewer");
  if (!viewport) return;
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    zoomTropical(e.deltaY < 0 ? 1.15 : 1/1.15, e.clientX, e.clientY);
  }, {passive:false});
  viewport.addEventListener("pointerdown", e => {
    if (tropicalViewer.scale <= 1) return;
    tropicalViewer.dragging = true;
    tropicalViewer.sx = e.clientX; tropicalViewer.sy = e.clientY;
    tropicalViewer.ox = tropicalViewer.x; tropicalViewer.oy = tropicalViewer.y;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("dragging");
  });
  viewport.addEventListener("pointermove", e => {
    if (!tropicalViewer.dragging) return;
    tropicalViewer.x = tropicalViewer.ox + e.clientX - tropicalViewer.sx;
    tropicalViewer.y = tropicalViewer.oy + e.clientY - tropicalViewer.sy;
    applyTropicalTransform();
  });
  const stop = () => { tropicalViewer.dragging=false; viewport.classList.remove("dragging"); };
  viewport.addEventListener("pointerup", stop);
  viewport.addEventListener("pointercancel", stop);
  $("#tropicalZoomIn")?.addEventListener("click", () => zoomTropical(1.25));
  $("#tropicalZoomOut")?.addEventListener("click", () => zoomTropical(1/1.25));
  $("#tropicalZoomReset")?.addEventListener("click", resetTropicalZoom);
}

function showTropical(key) {
  const product=tropicalProducts[key]||tropicalProducts.atl;
  document.querySelectorAll(".tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tropical===key));
  const frame=$("#tropicalFrame");
  if(!frame) return;
  frame.src=`${product.frame}${product.frame.includes("?")?"&":"?"}trg=${Date.now()}`;
  $("#tropicalTitle").textContent=product.title;
  $("#tropicalHeadline").textContent=product.head;
  $("#tropicalText").textContent=product.text;
  $("#tropicalSource").textContent=key==="wpac"?"JTWC":"NOAA / NHC";
  $("#tropicalUpdated") && ($("#tropicalUpdated").textContent=`Auto-refreshing official source • ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`);
}

function refreshTropical() {
  const image = $("#tropicalImage");
  if (!image) return;
  const key = image.dataset.key || "atl";
  showTropical(key);
}

function setupTropical() {
  if (!$("#tropicalImage")) return;
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showTropical(btn.dataset.tropical)));
  setupTropicalViewer();
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
  $("#go")?.addEventListener("click", loadLocationFromSearch);
  $("#location")?.addEventListener("keydown", e => { if (e.key === "Enter") loadLocationFromSearch(); });
  $("#useLocation")?.addEventListener("click", useBrowserLocation);
  $("#radarRefresh")?.addEventListener("click", loadRadar);
  $("#radarPlay")?.addEventListener("click", toggleRadarPlayback);
  $("#radarSlider")?.addEventListener("input", e => setRadarFrame(e.target.value));
  $("#radarLocate")?.addEventListener("click", () => state.point && centerRadar(state.point.latitude, state.point.longitude));
  $("#alertsRefresh")?.addEventListener("click", loadNationalAlerts);
  document.querySelectorAll(".alert-filter").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".alert-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    alertState.filter = btn.dataset.alertFilter || "all";
    renderAlertCards();
  }));
}

async function boot() {
  setupEvents();
  setupTropical();
  if (document.querySelector("#tropicalImage")) setInterval(refreshTropical, TROPICAL_REFRESH_MS);
  setupVideo();

  // Every page gets the live alert ticker, but only pages that contain a
  // specific product initialize that product. This keeps the multi-page site
  // fast and prevents missing-element JavaScript errors.
  loadNationalAlerts();
  setInterval(loadNationalAlerts, 60000);

  if ($("#radarMap")) initMap();
  if ($("#spcCatMap")) { loadSPCMaps(); setInterval(loadSPCMaps, 5 * 60 * 1000); }

  // Home + Forecast pages have the location controls/current conditions.
  if ($("#location")) {
    $("#location").value = CONFIG.defaultLocation;
    await loadLocationFromSearch();
  }
}

function ensureLeaflet(){
  if (window.L) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  await ensureLeaflet();
  boot();
});
