const $=s=>document.querySelector(s);
const icons=c=>c>=95?"⛈️":c>=80?"🌦️":c>=61?"🌧️":c>=45?"☁️":c<=1?"☀️":"🌤️";
const text={0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy showers",95:"Thunderstorms",96:"Thunderstorms + hail",99:"Thunderstorms + hail"};

async function geocode(q){
 const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
 if(!r.ok)throw Error("Location search failed");
 const j=await r.json(); if(!j.results?.length)throw Error("Location not found");
 return j.results[0];
}
async function openMeteo(p){
 const u=`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=5`;
 const r=await fetch(u);if(!r.ok)throw Error("Forecast unavailable");return r.json();
}
async function nwsAlerts(p){
 const r=await fetch(`https://api.weather.gov/alerts/active?point=${p.latitude},${p.longitude}`,{headers:{"Accept":"application/geo+json"}});
 if(!r.ok)throw Error("NWS alerts unavailable");return r.json();
}
function renderForecast(d){
 $("#forecastGrid").innerHTML=d.daily.time.map((date,i)=>{
  const day=i===0?"TODAY":new Date(date+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
  return `<article class="day-card"><b>${day}</b><div class="weather-icon">${icons(d.daily.weather_code[i])}</div><div class="temps">${Math.round(d.daily.temperature_2m_max[i])}° <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></div><div class="rain">💧 ${d.daily.precipitation_probability_max[i]??0}%</div><div class="desc">${text[d.daily.weather_code[i]]||"Forecast"}</div></article>`
 }).join("");
}
function renderAlerts(j){
 const box=$("#alertsBox");
 if(!j.features?.length){box.innerHTML='<div class="empty">No active NWS alerts for this location.</div>';return}
 box.innerHTML=j.features.slice(0,8).map(x=>{
  const p=x.properties||{};return `<div class="alert"><strong>${p.event||"Weather Alert"}</strong><span>${p.headline||p.description?.slice(0,180)||"Active NWS alert"}</span></div>`
 }).join("");
}
async function load(){
 const q=$("#location").value.trim(); if(!q)return;
 $("#status").textContent="Loading…";
 try{
  const p=await geocode(q),d=await openMeteo(p);
  $("#temp").textContent=Math.round(d.current.temperature_2m)+"°";
  $("#condition").textContent=text[d.current.weather_code]||"Current conditions";
  $("#feels").textContent="Feels "+Math.round(d.current.apparent_temperature)+"°";
  $("#wind").textContent="Wind "+Math.round(d.current.wind_speed_10m)+" mph";
  $("#humidity").textContent="RH "+Math.round(d.current.relative_humidity_2m)+"%";
  $("#status").textContent=`${p.name}${p.admin1?", "+p.admin1:""}`;
  renderForecast(d);
  try{renderAlerts(await nwsAlerts(p))}catch{renderAlerts({features:[]});$("#alertsBox").innerHTML='<div class="empty">NWS alerts could not be loaded right now.</div>'}
 }catch(e){$("#status").textContent=e.message||"Unable to load weather"}
}
$("#go").onclick=load;$("#location").onkeydown=e=>e.key==="Enter"&&load();load();
