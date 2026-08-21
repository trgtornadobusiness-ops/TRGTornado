/* TRGTornado SPC Outlook Engine V62
   Uses NOAA's official SPC Weather Outlook FeatureServer.
   Day 1-2: categorical/tornado/wind/hail. Day 3: categorical or severe probabilistic.
   Day 4-8: official probabilistic outlooks.
*/
(()=>{
 const BASE='https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/FeatureServer';
 const DAY_LAYERS={
  1:{categorical:1,tornado:3,wind:7,hail:5},
  2:{categorical:9,tornado:11,wind:15,hail:13},
  3:{categorical:17,severe:19},
  4:{categorical:21},5:{categorical:22},6:{categorical:23},7:{categorical:24},8:{categorical:25}
 };
 const names={categorical:'Categorical Outlook',tornado:'Tornado Probability',wind:'Wind Probability',hail:'Hail Probability',severe:'Severe Probability'};
 let map=null, geoLayer=null, day=1, type='categorical';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function effectiveType(){const available=DAY_LAYERS[day]||{}; if(available[type]) return type; return available.categorical?'categorical':'severe';}
 async function load(){
  if(!window.L)return;
  type=effectiveType();
  const layerId=DAY_LAYERS[day][type];
  const status=document.getElementById('spcStatus'), title=document.getElementById('spcProductName'), head=document.getElementById('severeHeadline'), text=document.getElementById('severeText'), legend=document.getElementById('spcLegend');
  title.textContent=`DAY ${day} ${names[type].toUpperCase()}`; head.innerHTML=`SPC Day ${day}<br/>${names[type]}`; text.textContent=`Live NOAA/SPC ${names[type].toLowerCase()} for forecast Day ${day}. Scroll to zoom and drag to pan.`;
  if(!map){map=L.map('spcMap',{zoomControl:true,scrollWheelZoom:true,dragging:true,attributionControl:true}).setView([38,-96],4);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:9,attribution:'© OpenStreetMap contributors'}).addTo(map)}
  if(geoLayer){geoLayer.remove();geoLayer=null} legend.innerHTML=''; status.textContent=`Loading live NOAA/SPC Day ${day}…`;
  try{
   const url=`${BASE}/${layerId}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&_trg=${Date.now()}`;
   const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/geo+json,application/json'}}); if(!r.ok)throw Error(`${r.status} ${r.statusText}`); const data=await r.json(); if(!data.features?.length)throw Error('No current features');
   geoLayer=L.geoJSON(data,{style:f=>{const p=f.properties||{};let fill=p.fill||'';if(!/^#?[0-9a-f]{6}$/i.test(fill))fill=defaultColor(p.dn,type);if(!fill.startsWith('#'))fill='#'+fill;let stroke=p.stroke||'#333';if(!/^#?[0-9a-f]{6}$/i.test(stroke))stroke='#333';if(!stroke.startsWith('#'))stroke='#'+stroke;return{color:stroke,weight:1.2,fillColor:fill,fillOpacity:.78,opacity:1}},onEachFeature:(f,l)=>{const p=f.properties||{};const label=p.label||p.label2||p.dn||names[type];l.bindPopup(`<strong>Day ${day} ${esc(names[type])}</strong><br>${esc(label)}`)}}).addTo(map);
   const b=geoLayer.getBounds();if(b.isValid())map.fitBounds(b.pad(.04),{animate:false});requestAnimationFrame(()=>map.invalidateSize(false));setTimeout(()=>map.invalidateSize(false),300);
   const vals=[...new Set(data.features.map(f=>f.properties?.dn).filter(v=>v!==null&&v!==undefined))].sort((a,b)=>Number(a)-Number(b));vals.slice(0,12).forEach(v=>{const s=document.createElement('span');s.textContent=labelFor(v,type);s.style.background=defaultColor(v,type);s.style.color='#111';legend.appendChild(s)});
   status.innerHTML=`Live NOAA/SPC • Day ${day} ${esc(names[type])} • refreshed ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} • <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open SPC</a>`;
  }catch(e){status.innerHTML=`SPC outlook unavailable right now. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open official SPC</a>`;console.warn('TRGTornado SPC:',e)}
 }
 function defaultColor(v,k){const n=Number(v);if(k==='categorical')return ({2:'#c1e9c1',3:'#66a366',4:'#ffe066',5:'#ffa366',6:'#e06666',8:'#ee99ee'}[n]||'#d9d9d9');return ({2:'#c1e9c1',5:'#ffa366',10:'#ffe066',15:'#e06666',25:'#ee99ee',30:'#ee99ee',45:'#cc66cc',60:'#9933aa',75:'#6622aa',90:'#441177'}[n]||'#d9d9d9')}
 function labelFor(v,k){if(k==='categorical')return ({2:'Thunderstorm',3:'Marginal',4:'Slight',5:'Enhanced',6:'Moderate',8:'High'}[Number(v)]||String(v));return `${v}%`}
 function bind(){document.querySelectorAll('.day').forEach(b=>b.addEventListener('click',()=>{day=Number(b.dataset.day);document.querySelectorAll('.day').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.type').forEach(x=>{const avail=DAY_LAYERS[day]||{};x.disabled=!avail[x.dataset.type];x.classList.toggle('active',x.dataset.type===effectiveType())});load()}));document.querySelectorAll('.type').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;type=b.dataset.type;document.querySelectorAll('.type').forEach(x=>x.classList.remove('active'));b.classList.add('active');load()}));document.querySelectorAll('.type').forEach(b=>{b.disabled=!DAY_LAYERS[1][b.dataset.type]})}
 function start(){if(!document.getElementById('spcMap'))return;bind();load()}
 document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));
})();