const $ = s => document.querySelector(s);

const CONFIG = {
  youtubeVideoId: "", // Put your YouTube Live/video ID between the quotes.
  radarZoom: 5
};

const text = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",56:"Freezing drizzle",57:"Freezing drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Heavy freezing rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Rain showers",81:"Rain showers",
  82:"Heavy showers",85:"Snow showers",86:"Heavy snow showers",95:"Thunderstorms",
  96:"Thunderstorms + hail",99:"Thunderstorms + hail"
};

const icons = c => c >= 95 ? "⛈️" : c >= 80 ? "🌦️" : c >= 61 ? "🌧️" : c >= 45 ? "☁️" : c <= 1 ? "☀️" : "🌤️";

let state = { point:null, forecast:null, map:null, radarLayer:null, radarFrames:[], radarIndex:0, radarTimer:null };

function imageFallback(img){
  img.style.display="none";
  const fallback=img.parentElement.querySelector(".image-fallback");
  if(fallback) fallback.style.display="grid";
}

async function geocode(q){
  const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  if(!r.ok) throw Error("Location search failed");
  const j=await r.json();
  if(!j.results?.length) throw Error("Location not found");
  return j.results[0];
}

async function openMeteo(p){
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure,visibility&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
  const r=await fetch(u);
  if(!r.ok) throw Error("Forecast unavailable");
  return r.json();
}

async function nwsAlerts(p){
  const r=await fetch(`https://api.weather.gov/alerts/active?point=${p.latitude},${p.longitude}`,{headers:{"Accept":"application/geo+json"}});
  if(!r.ok) throw Error("NWS alerts unavailable");
  return r.json();
}

function windDir(deg){
  if(deg == null) return "--";
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg/45)%8];
}

function renderCurrent(d,p){
  const c=d.current;
  $("#temp").textContent=Math.round(c.temperature_2m)+"°";
  $("#condition").textContent=text[c.weather_code]||"Current conditions";
  $("#currentLocation").textContent=`${p.name}${p.admin1?", "+p.admin1:""}`;
  $("#feels").textContent="Feels "+Math.round(c.apparent_temperature)+"°";
  $("#wind").textContent=`Wind ${Math.round(c.wind_speed_10m)} mph ${windDir(c.wind_direction_10m)}`;
  $("#humidity").textContent="RH "+Math.round(c.relative_humidity_2m)+"%";
  $("#pressure").textContent=`Pressure ${Math.round(c.surface_pressure)} hPa`;
  $("#visibility").textContent=`Visibility ${Math.round((c.visibility||0)/1609)} mi`;
}

function renderForecast(d){
  $("#forecastGrid").innerHTML=d.daily.time.map((date,i)=>{
    const day=i===0?"TODAY":new Date(date+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
    return `<article class="day-card">
      <b>${day}</b><div class="weather-icon">${icons(d.daily.weather_code[i])}</div>
      <div class="temps">${Math.round(d.daily.temperature_2m_max[i])}° <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></div>
      <div class="rain">💧 ${d.daily.precipitation_probability_max[i]??0}%</div>
      <div class="desc">${text[d.daily.weather_code[i]]||"Forecast"}</div>
      <div class="wind-small">💨 ${Math.round(d.daily.wind_speed_10m_max[i])} mph</div>
    </article>`;
  }).join("");
}

function renderHourly(d){
  const now=new Date();
  let start=d.hourly.time.findIndex(t=>new Date(t)>=now);
  if(start<0) start=0;
  const end=Math.min(start+24,d.hourly.time.length);
  $("#hourlyGrid").innerHTML=d.hourly.time.slice(start,end).map((t,j)=>{
    const i=start+j;
    const dt=new Date(t);
    const time=dt.toLocaleTimeString(undefined,{hour:"numeric"});
    return `<article class="hour-card"><b>${j===0?"NOW":time}</b><div>${icons(d.hourly.weather_code[i])}</div><strong>${Math.round(d.hourly.temperature_2m[i])}°</strong><span>💧 ${d.hourly.precipitation_probability[i]??0}%</span><small>${Math.round(d.hourly.wind_speed_10m[i])} mph</small></article>`;
  }).join("");
}

function alertClass(event=""){
  const e=event.toLowerCase();
  if(e.includes("tornado")) return "tornado";
  if(e.includes("severe thunderstorm")) return "severe";
  if(e.includes("warning")) return "warning";
  if(e.includes("watch")) return "watch";
  return "info";
}

function renderAlerts(j){
  const box=$("#alertsBox");
  const features=j.features||[];
  $("#alertTag").textContent=features.length?`${features.length} ACTIVE`:"ALL CLEAR";
  $("#alertTag").className=`tag ${features.length?"red":"green"}`;
  if(!features.length){
    box.innerHTML='<div class="empty">No active NWS alerts for this location.</div>';
    return;
  }
  box.innerHTML=features.slice(0,12).map(x=>{
    const p=x.properties||{};
    const expires=p.expires?new Date(p.expires).toLocaleString():"";
    return `<a class="alert ${alertClass(p.event)}" href="${p.web||"#"}" target="_blank" rel="noopener">
      <div class="alert-icon">!</div><div><strong>${p.event||"Weather Alert"}</strong>
      <span>${p.headline||p.description?.slice(0,220)||"Active NWS alert"}</span>
      ${expires?`<small>Expires ${expires}</small>`:""}</div>
    </a>`;
  }).join("");
}

async function loadAlerts(p){
  try{ renderAlerts(await nwsAlerts(p)); }
  catch{ $("#alertTag").textContent="UNAVAILABLE"; $("#alertsBox").innerHTML='<div class="empty">NWS alerts could not be loaded right now. Try again shortly.</div>'; }
}

async function loadLocation(p){
  $("#status").textContent="Loading weather…";
  try{
    const d=await openMeteo(p);
    state.point=p; state.forecast=d;
    renderCurrent(d,p); renderForecast(d); renderHourly(d);
    $("#status").textContent=`${p.name}${p.admin1?", "+p.admin1:""} • Updated ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`;
    await loadAlerts(p);
    centerRadar(p.latitude,p.longitude);
  }catch(e){ $("#status").textContent=e.message||"Unable to load weather"; }
}

async function load(){
  const q=$("#location").value.trim();
  if(!q) return;
  try{
    const p=await geocode(q);
    await loadLocation(p);
  }catch(e){ $("#status").textContent=e.message||"Location search failed"; }
}

function useBrowserLocation(){
  if(!navigator.geolocation){$("#status").textContent="Location services are not available.";return;}
  $("#status").textContent="Getting your location…";
  navigator.geolocation.getCurrentPosition(async pos=>{
    const p=await geocode(`${pos.coords.latitude},${pos.coords.longitude}`).catch(()=>null);
    const point=p||{latitude:pos.coords.latitude,longitude:pos.coords.longitude,name:"Your location"};
    $("#location").value=point.name;
    loadLocation(point);
  },()=>$("#status").textContent="Location permission was not granted.");
}

function initMap(){
  state.map=L.map("radarMap",{zoomControl:true}).setView([35.4676,-97.5164],CONFIG.radarZoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(state.map);
  state.radarLayer=L.layerGroup().addTo(state.map);
  loadRadar();
}

async function loadRadar(){
  const status=$("#radarStatus");
  status.textContent="Loading radar frames…";
  try{
    const r=await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if(!r.ok) throw Error();
    const j=await r.json();
    state.radarFrames=[...(j.radar?.past||[])];
    if(!state.radarFrames.length) throw Error();
    state.radarHost=j.host;
    state.radarIndex=state.radarFrames.length-1;
    renderRadarFrame();
    if(state.radarTimer) clearInterval(state.radarTimer);
    state.radarTimer=setInterval(()=>{
      state.radarIndex=(state.radarIndex+1)%state.radarFrames.length;
      renderRadarFrame();
    },1100);
    status.textContent=`Radar animation • ${state.radarFrames.length} frames`;
  }catch{
    status.textContent="Radar unavailable right now. Try refresh.";
  }
}

function renderRadarFrame(){
  if(!state.radarLayer||!state.radarFrames.length)return;
  state.radarLayer.clearLayers();
  const f=state.radarFrames[state.radarIndex];
  const url=`${state.radarHost}${f.path}/512/{z}/{x}/{y}/2/1_1.png`;
  L.tileLayer(url,{tileSize:512,zoomOffset:-1,opacity:.68,maxNativeZoom:7,maxZoom:12,attribution:"Weather data by RainViewer"}).addTo(state.radarLayer);
}

function centerRadar(lat,lon){
  if(state.map) state.map.setView([lat,lon],CONFIG.radarZoom);
}

function setupTropical(){
  const data={
    atl:{title:"ATLANTIC 7-DAY OUTLOOK",img:"https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png",head:"Atlantic Tropical Outlook",text:"Monitor the Atlantic basin for tropical waves, areas of development and active tropical cyclones."},
    epac:{title:"EASTERN PACIFIC 7-DAY OUTLOOK",img:"https://www.nhc.noaa.gov/xgtwo/two_epac_7d0.png",head:"Eastern Pacific Outlook",text:"Monitor the eastern Pacific for tropical development and active systems."},
    cpac:{title:"CENTRAL PACIFIC 7-DAY OUTLOOK",img:"https://www.nhc.noaa.gov/xgtwo/two_cpac_7d0.png",head:"Central Pacific Outlook",text:"Monitor the central Pacific for tropical development and active systems."}
  };
  document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    const d=data[btn.dataset.tropical];
    $("#tropicalTitle").textContent=d.title; $("#tropicalImage").src=d.img;
    $("#tropicalImage").style.display="block"; $("#tropicalImage").nextElementSibling.style.display="none";
    $("#tropicalHeadline").textContent=d.head; $("#tropicalText").textContent=d.text;
  });
}

function setupVideo(){
  if(CONFIG.youtubeVideoId){
    $("#youtubeFrame").src=`https://www.youtube.com/embed/${CONFIG.youtubeVideoId}?autoplay=0&rel=0`;
    $("#videoPlaceholder").style.display="none";
    $("#youtubeLink").href=`https://www.youtube.com/watch?v=${CONFIG.youtubeVideoId}`;
  }
}

$("#go").onclick=load;
$("#location").onkeydown=e=>e.key==="Enter"&&load();
$("#useLocation").onclick=useBrowserLocation;
$("#radarRefresh").onclick=loadRadar;
$("#radarLocate").onclick=()=>state.point&&centerRadar(state.point.latitude,state.point.longitude);

setupTropical();
setupVideo();
initMap();
load();
