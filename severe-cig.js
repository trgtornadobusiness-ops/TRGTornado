/* TRG Severe CIG1 overlay — SPC's 2026 Conditional Intensity Guidance. */
(()=>{
const URLS={tornado:'https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson',wind:'https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson',hail:'https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson'};
const IDS={tornado:'spcTornMap',wind:'spcWindMap',hail:'spcHailMap'};let seen=new Set();
const color={tornado:'#ff3030',wind:'#ff8a00',hail:'#ffd52e'};
function init(map){const id=map.getContainer?.().id;if(!IDS[id])return;const type=Object.keys(IDS).find(k=>IDS[k]===id);if(seen.has(id))return;seen.add(id);fetch(URLS[type]+'?trg='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(data=>{
 const features=(data.features||[]).filter(f=>{const p=f.properties||{};return String(p.CIG||p.cig||p.INTENSITY||p.intensity||p.dn||'').toUpperCase()==='1'||Number(p.CIG||p.cig||p.INTENSITY||p.intensity||p.dn)===1});
 if(!features.length)return;
 const layer=L.geoJSON({type:'FeatureCollection',features},{style:{color:color[type],weight:3,dashArray:'7 5',fillColor:color[type],fillOpacity:.12},onEachFeature:(f,l)=>l.bindTooltip('CIG 1',{sticky:true})}).addTo(map);
 layer.bringToFront?.();
 }).catch(e=>console.warn('TRG CIG1 load failed',type,e));}
function hook(){if(!window.L||window.__trgCIGHook)return;window.__trgCIGHook=true;L.Map.addInitHook(function(){init(this)})}
hook();if(!window.__trgCIGHook){const t=setInterval(()=>{hook();if(window.__trgCIGHook)clearInterval(t)},50);setTimeout(()=>clearInterval(t),10000)}
})();
