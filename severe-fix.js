/* TRGTornado Severe Map Fix v2
   Rebuild the SPC maps cleanly after app.js. This keeps the outlooks interactive
   while avoiding the broken USGS base layer and stale Leaflet instances.
*/
(() => {
  const products = [
    {id:"spcCatMap", status:"spcCatStatus", layer:1, label:"SPC Day 1 categorical outlook", kind:"categorical"},
    {id:"spcTornMap", status:"spcTornStatus", layer:3, label:"SPC tornado probability", kind:"tornado"},
    {id:"spcWindMap", status:"spcWindStatus", layer:7, label:"SPC wind probability", kind:"wind"},
    {id:"spcHailMap", status:"spcHailStatus", layer:5, label:"SPC hail probability", kind:"hail"}
  ];
  const base = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/FeatureServer";
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const color = (dn, kind) => {
    const n=Number(dn);
    if(kind==="categorical") return ({2:"#c1e9c1",3:"#66a366",4:"#ffe066",5:"#ffa366",6:"#e06666",8:"#ee99ee"}[n]||"#d9d9d9");
    return ({2:"#c1e9c1",5:"#ffa366",10:"#ffe066",15:"#e06666",25:"#ee99ee"}[n]||"#d9d9d9");
  };
  async function getGeo(layer){
    const url=`${base}/${layer}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&_trg=${Date.now()}`;
    const r=await fetch(url,{cache:"no-store",headers:{Accept:"application/geo+json,application/json"}});
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  async function build(p){
    const el=document.getElementById(p.id), status=document.getElementById(p.status);
    if(!el || !window.L) return;
    el.style.height=p.kind==="categorical"?"430px":"300px";
    el.style.minHeight=el.style.height;
    if(typeof SPC!=="undefined" && SPC.maps?.[p.id]) { try { SPC.maps[p.id].remove(); } catch {} delete SPC.maps[p.id]; }
    el.innerHTML="";
    const map=L.map(el,{zoomControl:true,attributionControl:true,dragging:true,scrollWheelZoom:true,doubleClickZoom:true,touchZoom:true,boxZoom:true}).setView([38,-96],4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:8,attribution:"© OpenStreetMap contributors"}).addTo(map);
    try {
      status.textContent=`Loading live ${p.label}…`;
      const data=await getGeo(p.layer);
      if(!data?.features?.length) throw new Error("No current SPC features returned");
      const layer=L.geoJSON(data,{
        style:f=>{const x=f.properties||{}; const fill=/^#?[0-9a-f]{6}$/i.test(String(x.fill||""))?(String(x.fill).startsWith("#")?x.fill:`#${x.fill}`):color(x.dn,p.kind); const stroke=/^#?[0-9a-f]{6}$/i.test(String(x.stroke||""))?(String(x.stroke).startsWith("#")?x.stroke:`#${x.stroke}`):"#333333"; return {color:stroke,weight:1.2,fillColor:fill,fillOpacity:.78,opacity:1};},
        onEachFeature:(f,l)=>{const x=f.properties||{}; l.bindPopup(`<strong>${esc(x.label||x.label2||x.dn||p.label)}</strong>`);}
      }).addTo(map);
      map._trgSpcLayer=layer;
      const bounds=layer.getBounds();
      if(bounds.isValid()) map.fitBounds(bounds.pad(.04),{animate:false});
      requestAnimationFrame(()=>map.invalidateSize(false));
      setTimeout(()=>map.invalidateSize(false),400);
      if(typeof SPC!=="undefined") SPC.maps[p.id]=map;
      if(status) status.innerHTML=`Live NOAA/SPC ${esc(p.label)} • refreshed ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} • <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open SPC</a>`;
    } catch(e) {
      if(status) status.innerHTML=`${esc(p.label)} unavailable right now. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open official SPC</a>`;
      console.warn("TRGTornado SPC rebuild failed",p.kind,e);
    }
  }
  function start(){ if(!document.getElementById("spcCatMap")) return; products.forEach(build); }
  document.addEventListener("DOMContentLoaded",()=>setTimeout(start,700));
})();
