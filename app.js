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
  const headers = {Accept:"application/geo+json"};
  const points = await fetchJson(`https://api.weather.gov/points/${point.latitude},${point.longitude}`, {headers});
  const props = points?.properties || {};
  const forecastUrl = props.forecast;
  const hourlyUrl = props.forecastHourly;
  const office = props.cwa || props.gridId || "NWS";
  if (!forecastUrl && !hourlyUrl) throw new Error("NWS could not find a forecast for this location.");

  // Use the URLs NWS returns first. If either endpoint fails, fall back to the
  // gridpoint endpoint from the same /points response rather than abandoning
  // the whole forecast.
  const gridUrl = props.gridId && Number.isFinite(Number(props.gridX)) && Number.isFinite(Number(props.gridY))
    ? `https://api.weather.gov/gridpoints/${encodeURIComponent(props.gridId)}/${props.gridX},${props.gridY}` : null;

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
  if (!hourly?.properties?.periods?.length && grid?.properties?.forecastHourly) {
    hourly = await fetchJson(grid.properties.forecastHourly, {headers, timeout:20000}).catch(() => null);
  }
  if (!forecast?.properties?.periods?.length && !hourly?.properties?.periods?.length) {
    throw new Error("NWS forecast services are temporarily unavailable.");
  }

  let observation = null;
  const stationUrl = stationsResult.status === "fulfilled" ? stationsResult.value?.features?.[0]?.id : null;
  if (stationUrl) observation = await fetchJson(`${stationUrl}/observations/latest`, {headers, timeout:12000}).catch(() => null);

  const op = observation?.properties || {};
  const hp = hourly?.properties?.periods || [];
  const firstHour = hp[0] || {};
  const currentTemp = op.temperature?.value != null ? cToF(op.temperature.value) : (firstHour.temperature ?? null);
  const apparent = op.heatIndex?.value != null ? cToF(op.heatIndex.value) : op.windChill?.value != null ? cToF(op.windChill.value) : (firstHour.temperature ?? null);
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

  // NWS's 7-day product is a sequence of day/night periods. Build exactly
  // seven calendar days from daytime periods, pairing each day with the
  // following nighttime period for a reliable low temperature.
  const periods = forecast?.properties?.periods || [];
  const daytime = periods.filter(p => p.isDaytime);
  const daily = {time:[], temperature_2m_max:[], temperature_2m_min:[], precipitation_probability_max:[], wind_speed_10m_max:[], text:[]};
  daytime.slice(0,7).forEach((day, i) => {
    const date = (day.startTime || "").slice(0,10);
    const night = periods.find(p => !p.isDaytime && p.startTime > day.startTime && p.startTime.slice(0,10) <= (new Date(new Date(day.startTime).getTime()+36e5*30)).toISOString().slice(0,10));
    const temps = [day.temperature, night?.temperature].map(Number).filter(Number.isFinite);
    const pops = [day.probabilityOfPrecipitation?.value, night?.probabilityOfPrecipitation?.value].map(Number).filter(Number.isFinite);
    const winds = [parseWindMph(day.windSpeed), parseWindMph(night?.windSpeed)].filter(Number.isFinite);
    daily.time.push(date);
    daily.temperature_2m_max.push(Number.isFinite(Number(day.temperature)) ? Number(day.temperature) : (temps.length ? Math.max(...temps) : null));
    daily.temperature_2m_min.push(Number.isFinite(Number(night?.temperature)) ? Number(night.temperature) : (temps.length ? Math.min(...temps) : null));
    daily.precipitation_probability_max.push(pops.length ? Math.max(...pops) : 0);
    daily.wind_speed_10m_max.push(winds.length ? Math.max(...winds) : 0);
    daily.text.push(day.shortForecast || day.detailedForecast || "Forecast");
  });

  const hourlyOut = {time:[], temperature_2m:[], precipitation_probability:[], wind_speed_10m:[], text:[]};
  hp.slice(0,72).forEach(h => {
    hourlyOut.time.push(h.startTime);
    hourlyOut.temperature_2m.push(Number.isFinite(Number(h.temperature)) ? Number(h.temperature) : null);
    hourlyOut.precipitation_probability.push(h.probabilityOfPrecipitation?.value ?? 0);
    hourlyOut.wind_speed_10m.push(parseWindMph(h.windSpeed) ?? 0);
    hourlyOut.text.push(h.shortForecast || "Forecast");
  });
  return {current, daily, hourly:hourlyOut, office, point, forecastAvailable:daily.time.length>0, hourlyAvailable:hourlyOut.time.length>0};
}

function windDir(degrees) {
  if (degrees == null || Number.isNaN(Number(degrees))) return "--";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(degrees / 45) % 8];
}

function renderCurrent(data, point) {
  const c = data?.current || {};
  const set=(id,value)=>{const el=$(id); if(el) el.textContent=value;};
  const temp=Number.isFinite(Number(c.temperature_2m)) ? `${Math.round(c.temperature_2m)}°` : "--°";
  const feels=Number.isFinite(Number(c.apparent_temperature)) ? `Feels ${Math.round(c.apparent_temperature)}°` : "Feels --°";
  const wind=Number.isFinite(Number(c.wind_speed_10m)) ? `Wind ${Math.round(c.wind_speed_10m)} mph ${windDir(c.wind_direction_10m)}` : "Wind --";
  const humidity=Number.isFinite(Number(c.relative_humidity_2m)) ? `RH ${Math.round(c.relative_humidity_2m)}%` : "RH --%";
  set("#temp",temp); set("#condition",c.text || "Current conditions");
  set("#currentLocation",`${point?.name || "Selected location"}${point?.admin1 ? `, ${point.admin1}` : ""}`);
  set("#feels",feels); set("#wind",wind); set("#humidity",humidity);
  set("#pressure",c.surface_pressure != null ? `Pressure ${Math.round(c.surface_pressure)} hPa` : "Pressure --");
  set("#visibility",c.visibility != null ? `Visibility ${Math.max(0, Math.round(c.visibility))} mi` : "Visibility --");
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
  const grid=$("#hourlyGrid");
  if(!grid) return;
  const now = new Date();
  let start = data.hourly.time.findIndex(t => new Date(t) >= now);
  if (start < 0) start = 0;
  const end = Math.min(start + 24, data.hourly.time.length);
  grid.innerHTML = data.hourly.time.slice(start, end).map((time, offset) => {
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

async function fetchStaticAlertsFallback(){
  const urls=["./alerts.json?trg="+Date.now(), "https://api.github.com/repos/OWNER/REPO/contents/alerts.json"];
  for(const url of urls.slice(0,1)){
    try{const r=await fetch(url,{cache:"no-store"}); if(!r.ok) continue; const d=await r.json(); if(Array.isArray(d?.features)) return {features:d.features,meta:{staticFallback:true,checkedAt:new Date().toISOString()}};}catch{}
  }
  return null;
}

async function nwsAlerts(point) {
  // Alert architecture: NOAA's CurrentWarnings/WWA GIS is the primary browser-safe
  // source because it is designed for public web mapping. NWS /alerts/active is
  // retained as a secondary source. We validate each response before considering
  // it successful so an empty/broken response can NEVER be interpreted as ALL CLEAR.
  const apiParams = new URLSearchParams({limit:"500"});
  if (point) apiParams.set("point", `${point.latitude},${point.longitude}`);
  const apiUrl = `https://api.weather.gov/alerts/active?${apiParams.toString()}`;

  const gisUrl = (layer) => {
    const params = new URLSearchParams({
      where:"1=1", outFields:"*", returnGeometry:"false", f:"json",
      resultRecordCount:"2000", _trg:String(Date.now())
    });
    return `https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer/${layer}/query?${params}`;
  };

  const normalizeNws = (features=[]) => features.map((item, i) => {
    const p=item.properties||{};
    return {id:item.id||p.id||`nws-${i}-${p.sent||p.effective||""}`,properties:{...p,
      event:p.event||"Weather Alert", headline:p.headline||p.description||p.event||"Weather Alert",
      areaDesc:p.areaDesc||"Active NWS area", web:p.web||item.id||"https://www.weather.gov/alerts",
      status:p.status||"Actual", messageType:p.messageType||"Alert"},geometry:item.geometry||null};
  }).filter(isOngoingAlert);

  const arcDate = value => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return new Date(value).toISOString();
    const n = Number(value);
    if (Number.isFinite(n) && n > 100000000000) return new Date(n).toISOString();
    return String(value);
  };

  const normalizeGis = (data, layer) => {
    const rows = Array.isArray(data?.features) ? data.features : [];
    return rows.map((f,i)=>{
      // ArcGIS f=json returns attributes; GeoJSON-style responses use properties.
      const a=f?.attributes || f?.properties || {};
      const phenom=String(a.phenom||a.PHENOM||"").toUpperCase();
      const sig=String(a.sig||a.SIG||"").toUpperCase();
      const rawEvent=String(a.prod_type||a.PROD_TYPE||a.event||a.EVENT||"").trim();
      const event=rawEvent || hazardName(phenom,sig);
      const effective=arcDate(a.onset||a.ONSET||a.issuance||a.ISSUANCE||a.issue||a.ISSUE);
      const expires=arcDate(a.expiration||a.EXPIRATION||a.ends||a.ENDS||a.expire||a.EXPIRE);
      const id=a.cap_id||a.CAP_ID||a.id||a.ID||`${layer}-${a.wfo||a.WFO||"NWS"}-${phenom}-${sig}-${a.issuance||a.ISSUANCE||a.idp_ingestdate||i}`;
      return {id:String(id),properties:{
        event:event||"Weather Alert", headline:a.headline||a.HEADLINE||rawEvent||event,
        areaDesc:a.areaDesc||a.AREADESC||a.county||a.zone||a.ugc||a.UGC||"Active NWS area",
        effective,onset:effective,expires,ends:expires,sent:effective,
        severity:a.severity||severityForPhenomena(phenom), urgency:a.urgency||"Immediate", certainty:a.certainty||"Observed",
        web:a.url||a.URL||"https://www.weather.gov/alerts", status:"Actual", messageType:a.msg_type||a.MSG_TYPE||"Alert",
        phenom,sig,wfo:a.wfo||a.WFO,ingest:a.idp_ingestdate||a.IDP_INGESTDATE||null
      },geometry:f?.geometry||null};
    }).filter(isOngoingAlert);
  };

  const requests = [
    {kind:"nws", promise:fetchJson(apiUrl,{timeout:15000,headers:{Accept:"application/geo+json,application/json"}})},
    {kind:"warnings", promise:fetchJson(gisUrl(0),{timeout:20000,headers:{Accept:"application/json"}})},
    {kind:"watches", promise:fetchJson(gisUrl(1),{timeout:20000,headers:{Accept:"application/json"}})}
  ];
  const results=await Promise.allSettled(requests.map(x=>x.promise));
  const merged=new Map(); let successful=0; let returnedRows=0;
  results.forEach((r,index)=>{
    if(r.status!=="fulfilled") return;
    const value=r.value;
    let items=[];
    if(index===0){
      if(!Array.isArray(value?.features)) return;
      items=normalizeNws(value.features);
    } else {
      if(!Array.isArray(value?.features)) return;
      items=normalizeGis(value,index-1);
    }
    successful++; returnedRows += items.length;
    items.forEach(item=>{
      const p=item.properties||{};
      // Prefer a stable CAP/product identity where possible, but also prevent the
      // same warning from appearing twice when NWS and NOAA IDs differ.
      const event=String(p.event||"").toLowerCase().replace(/\s+/g," ");
      const area=String(p.areaDesc||"").toLowerCase().slice(0,500);
      const expires=String(p.expires||"");
      const key=item.id || `${event}|${area}|${expires}`;
      const old=merged.get(key);
      if(!old || alertPriority(item)>alertPriority(old)) merged.set(key,item);
    });
  });
  // A technically successful HTTP request with zero parsed records is not proof
  // that the live feed is healthy. Require at least one valid source response.
  if(!successful || returnedRows===0){ const fallback=await fetchStaticAlertsFallback(); if(fallback?.features?.length) return fallback; if(successful) return {features:[],meta:{successfulSources:successful,returnedRows,checkedAt:new Date().toISOString(),emptyLiveFeed:true}}; throw new Error("All live NWS/NOAA alert sources failed"); }
  return {features:[...merged.values()], meta:{successfulSources:successful, returnedRows, checkedAt:new Date().toISOString()}};
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
  if (status && !["actual","active"].includes(status)) return false;
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
    const feedOffline = !alertState.lastSuccessMs;
    track.innerHTML=feedOffline
      ? '<span class="ticker-item ticker-error"><span class="ticker-badge">NWS ALERTS</span> Connecting to the live warning feed…</span>'
      : '<span class="ticker-item ticker-clear"><span class="ticker-badge">ALL CLEAR</span> No active NWS warnings or watches in the current feed.</span>';
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
  if(!button) return;
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
  layers: { categorical:1, tornado:3, tornadoCig:2, hailCig:4, hail:5, windCig:6, wind:7 },
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
    map = L.map(mapEl, {zoomControl:true, attributionControl:true, dragging:true, scrollWheelZoom:true, doubleClickZoom:true, touchZoom:true}).setView([38,-96],4);
    L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {maxZoom:8, attribution:"USGS"}).addTo(map);
    SPC.maps[mapId]=map;
  }
  status.textContent=`Loading live ${label}…`;
  try {
    const url = `${SPC.base}/${SPC.layers[key]}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&_trg=${Date.now()}`;
    const data = await fetchJson(url, {timeout:20000, headers:{Accept:"application/geo+json,application/json"}});
    if (!data?.features?.length) throw new Error("No current SPC features returned");
    if (map._spcLayer) map.removeLayer(map._spcLayer);
    const layer = L.geoJSON(data, {
      style: feature => {
        const p=feature?.properties||{};
        const cig = String(p.label || p.label2 || "").toUpperCase();
        const fill=validColor(p.fill) ? p.fill : spcFallbackColor(p.dn, key, cig);
        const stroke=validColor(p.stroke) ? p.stroke : (key === "tornadoCig" ? "#111111" : "#333333");
        if (key === "tornadoCig") return {color:stroke, weight:cig==="CIG1"?1.5:2, dashArray:cig==="CIG1"?"8 7":cig==="CIG2"?"3 7":"2 5", fillColor:"#ffffff", fillOpacity:cig==="CIG1"?0.08:0.14, opacity:1};
        return {color:stroke, weight:1, fillColor:fill, fillOpacity:0.82, opacity:1};
      },
      onEachFeature: (feature, lyr) => {
        const p=feature?.properties||{};
        const labelText=p.label||p.label2||p.dn||label;
        const valid=p.valid||p.issue||"";
        lyr.bindPopup(`<strong>${escapeHtml(labelText)}</strong>${valid?`<br><small>${escapeHtml(valid)}</small>`:""}`);
      }
    }).addTo(map);
    map._spcLayer=layer;
    const bounds=layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.04), {animate:false});
    status.innerHTML=`Live NOAA/SPC ${escapeHtml(label)} • refreshed ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} • <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open SPC</a>`;
    mapEl.classList.remove("map-error");
  } catch(error) {
    status.innerHTML=`${escapeHtml(label)} unavailable right now. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open official SPC</a>`;
    mapEl.classList.add("map-error");
    console.warn("SPC layer failed", key, error);
  }
}
function validColor(value){ return typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value.trim()); }
function spcFallbackColor(dn,key,label=""){
  if(key==="tornadoCig") {
    const l=String(label||"").toUpperCase();
    return "#ffffff";
  }
  const v=Number(dn);
  if(key==="categorical") return ({2:"#c1e9c1",3:"#66a366",4:"#ffe066",5:"#ffa366",6:"#e06666",8:"#ee99ee"}[v]||"#d9d9d9");
  return ({2:"#c1e9c1",5:"#ffa366",10:"#ffe066",15:"#e06666",25:"#ee99ee"}[v]||"#d9d9d9");
}


async function loadSpcConditionalOverlay(mapId, layerKey, storageKey) {
  const map = SPC.maps[mapId];
  if (!map) return;
  try {
    const url = `${SPC.base}/${SPC.layers[layerKey]}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&_trg=${Date.now()}`;
    const data = await fetchJson(url, {timeout:20000, headers:{Accept:"application/geo+json,application/json"}});
    if (!data?.features?.length) return;
    if (map[storageKey]) map.removeLayer(map[storageKey]);
    const layer = L.geoJSON(data, {
      style: feature => {
        const p = feature?.properties || {};
        const cig = String(p.label || p.label2 || p.dn || "").toUpperCase();
        return {
          color: "#111111",
          weight: cig === "CIG1" ? 2.2 : 2.7,
          opacity: 0.98,
          fillColor: "#ffffff",
          fillOpacity: 0.03,
          dashArray: cig === "CIG1" ? "9 8" : cig === "CIG2" ? "4 7" : "2 5"
        };
      },
      onEachFeature: (feature, lyr) => {
        const p = feature?.properties || {};
        const cig = String(p.label || p.label2 || p.dn || "CIG").toUpperCase();
        lyr.bindTooltip(cig, {sticky:true});
      }
    }).addTo(map);
    map[storageKey] = layer;
  } catch (error) {
    console.warn(`SPC conditional overlay failed: ${layerKey}`, error);
  }
}

async function loadSpcCigOverlay() {
  await loadSpcConditionalOverlay("spcCatMap", "tornadoCig", "_spcTornadoCigLayer");
}

function loadSPCMaps() {
  loadSpcLayer("categorical", "spcCatMap", "spcCatStatus", "SPC categorical outlook");
  loadSpcLayer("tornado", "spcTornMap", "spcTornStatus", "tornado probability").then(() => loadSpcConditionalOverlay("spcTornMap", "tornadoCig", "_spcCigLayer"));
  loadSpcLayer("wind", "spcWindMap", "spcWindStatus", "wind probability").then(() => loadSpcConditionalOverlay("spcWindMap", "windCig", "_spcWindCigLayer"));
  loadSpcLayer("hail", "spcHailMap", "spcHailStatus", "hail probability").then(() => loadSpcConditionalOverlay("spcHailMap", "hailCig", "_spcHailCigLayer"));
}

const tropicalProducts = {
  atl:{title:"ATLANTIC 7-DAY OUTLOOK", image:"https://www.nhc.noaa.gov/xgtwo/images/xgtwo_atl_7d0.png", official:"https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=7", head:"Atlantic Tropical Outlook", text:"Current NHC Atlantic 7-day graphical outlook."},
  epac:{title:"EASTERN PACIFIC 7-DAY OUTLOOK", image:"https://www.nhc.noaa.gov/xgtwo/images/xgtwo_pac_7d0.png", official:"https://www.nhc.noaa.gov/gtwo.php?basin=epac&fdays=7", head:"Eastern Pacific Outlook", text:"Current NHC Eastern Pacific 7-day graphical outlook."},
  cpac:{title:"CENTRAL PACIFIC 7-DAY OUTLOOK", image:"https://www.nhc.noaa.gov/xgtwo/images/xgtwo_cpac_7d0.png", official:"https://www.nhc.noaa.gov/gtwo.php?basin=cpac&fdays=7", head:"Central Pacific Outlook", text:"Current NHC Central Pacific 7-day graphical outlook."},
  wpac:{title:"JTWC WESTERN PACIFIC", image:null, frame:"https://www.metoc.navy.mil/jtwc/jtwc.html", official:"https://www.metoc.navy.mil/jtwc/jtwc.html", head:"JTWC Western Pacific", text:"Current official JTWC tropical products and Western Pacific warnings."}
};
const TROPICAL_REFRESH_MS=5*60*1000;
const tropicalViewer={scale:1,x:0,y:0,dragging:false,sx:0,sy:0,ox:0,oy:0};
function applyTropicalTransform(){const image=$("#tropicalImage");if(!image)return;image.style.transform=`translate(${tropicalViewer.x}px,${tropicalViewer.y}px) scale(${tropicalViewer.scale})`;}
function resetTropicalZoom(){tropicalViewer.scale=1;tropicalViewer.x=0;tropicalViewer.y=0;applyTropicalTransform();}
function zoomTropical(delta,cx=null,cy=null){const viewport=$("#tropicalViewer"),image=$("#tropicalImage");if(!viewport||!image)return;const old=tropicalViewer.scale,next=Math.max(1,Math.min(4,old*delta));if(next===old)return;if(cx!=null&&cy!=null){const r=viewport.getBoundingClientRect(),px=cx-r.left,py=cy-r.top;tropicalViewer.x=px-(px-tropicalViewer.x)*(next/old);tropicalViewer.y=py-(py-tropicalViewer.y)*(next/old);}tropicalViewer.scale=next;applyTropicalTransform();}
function setupTropicalViewer(){const viewport=$("#tropicalViewer");if(!viewport)return;viewport.addEventListener("wheel",e=>{e.preventDefault();zoomTropical(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY);},{passive:false});viewport.addEventListener("pointerdown",e=>{if(tropicalViewer.scale<=1)return;tropicalViewer.dragging=true;tropicalViewer.sx=e.clientX;tropicalViewer.sy=e.clientY;tropicalViewer.ox=tropicalViewer.x;tropicalViewer.oy=tropicalViewer.y;viewport.setPointerCapture(e.pointerId);viewport.classList.add("dragging");});viewport.addEventListener("pointermove",e=>{if(!tropicalViewer.dragging)return;tropicalViewer.x=tropicalViewer.ox+e.clientX-tropicalViewer.sx;tropicalViewer.y=tropicalViewer.oy+e.clientY-tropicalViewer.sy;applyTropicalTransform();});const stop=()=>{tropicalViewer.dragging=false;viewport.classList.remove("dragging")};viewport.addEventListener("pointerup",stop);viewport.addEventListener("pointercancel",stop);$("#tropicalZoomIn")?.addEventListener("click",()=>zoomTropical(1.25));$("#tropicalZoomOut")?.addEventListener("click",()=>zoomTropical(1/1.25));$("#tropicalZoomReset")?.addEventListener("click",resetTropicalZoom);}
function showTropical(key){const product=tropicalProducts[key]||tropicalProducts.atl;document.querySelectorAll(".tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tropical===key));const frame=$("#tropicalFrame"),image=$("#tropicalImage");resetTropicalZoom();
  if(frame) frame.style.display="none";
  if(image){image.style.display="block"; image.alt=product.title; image.style.objectFit="contain"; image.style.width="100%"; image.style.height="100%"; image.style.maxWidth="100%"; image.style.maxHeight="100%";
    if(product.image){image.src=`${product.image}?trg=${Date.now()}`;image.onload=()=>{$("#tropicalUpdated")&&($("#tropicalUpdated").textContent=`Live NHC graphic loaded • ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`)};image.onerror=()=>{imageFallback(image,`Current NHC graphic unavailable — open the official NHC outlook below`)};}
    else {image.style.display="none";if(frame){frame.src=`${product.frame}?trg=${Date.now()}`;frame.style.display="block";frame.onload=()=>{$("#tropicalUpdated")&&($("#tropicalUpdated").textContent=`Official JTWC page loaded • ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`)}}}
  }
  $("#tropicalTitle")&&($("#tropicalTitle").textContent=product.title);$("#tropicalHeadline")&&($("#tropicalHeadline").textContent=product.head);$("#tropicalText")&&($("#tropicalText").textContent=product.text);$("#tropicalSource")&&($("#tropicalSource").textContent=key==="wpac"?"JTWC":"NOAA / NHC");const arrow=document.querySelector(".tropical-story .arrow");if(arrow){arrow.href=product.official||product.frame;arrow.textContent=key==="wpac"?"OPEN JTWC →":"OPEN NHC →";}}
function refreshTropical(){showTropical(document.querySelector(".tab.active")?.dataset.tropical||"atl");}
function setupTropical(){if(!$("#tropicalViewer"))return;document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>showTropical(btn.dataset.tropical)));setupTropicalViewer();$("#tropicalImage")?.addEventListener("error",()=>imageFallback($("#tropicalImage"),"Current NHC graphic unavailable — open the official NHC outlook below"));showTropical("atl");setInterval(refreshTropical,TROPICAL_REFRESH_MS);}

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
