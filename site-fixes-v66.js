/* TRGTornado v66 compatibility fixes
   - Keep active warnings alive through transient NWS fetch failures.
   - Make ticker colors match the Weather Alerts page.
   - Rebuild SPC products as interactive Leaflet maps using reliable NOAA/SPC image exports.
   - Fix Leaflet sizing/zoom-control glitches after page layout settles.
*/
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const alertClass = event => {
    const e = String(event || '').toLowerCase();
    if (e.includes('tornado emergency') || e.includes('flash flood emergency')) return 'emergency';
    if (e.includes('tornado warning')) return 'tornado';
    if (e.includes('flash flood warning')) return 'flash';
    if (e.includes('severe thunderstorm warning') || e.includes('extreme wind warning')) return 'severe';
    if (e.includes('warning')) return 'warning';
    if (e.includes('watch')) return 'watch';
    if (e.includes('statement')) return 'statement';
    return 'advisory';
  };
  const ongoing = item => {
    const p = item?.properties || {};
    const s = String(p.status || 'Actual').toLowerCase();
    const m = String(p.messageType || 'Alert').toLowerCase();
    const eff = Date.parse(p.effective || p.onset || p.sent || '');
    const exp = Date.parse(p.expires || p.ends || '');
    return (s === 'actual' || s === 'active') && m !== 'cancel' && (!Number.isFinite(eff) || eff <= Date.now()) && (!Number.isFinite(exp) || exp > Date.now());
  };
  const priority = event => {
    const e = String(event || '').toLowerCase();
    if (e.includes('tornado emergency')) return 140;
    if (e.includes('flash flood emergency')) return 135;
    if (e.includes('tornado warning')) return 130;
    if (e.includes('flash flood warning')) return 120;
    if (e.includes('severe thunderstorm warning') || e.includes('extreme wind warning')) return 115;
    if (e.includes('warning')) return 100;
    if (e.includes('tornado watch')) return 78;
    if (e.includes('severe thunderstorm watch')) return 74;
    if (e.includes('watch')) return 70;
    if (e.includes('statement')) return 35;
    return 50;
  };
  const sort = a => [...a].sort((x,y) => priority(y.properties?.event) - priority(x.properties?.event) || (Date.parse(x.properties?.expires || '') || Infinity) - (Date.parse(y.properties?.expires || '') || Infinity));
  const area = p => String(p?.areaDesc || 'ACTIVE NWS AREA').split(';').map(x => x.trim()).filter(Boolean).slice(0,3).join(' • ');
  const remaining = expires => {
    const ms = Date.parse(expires || '') - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${Math.max(1,m)} MIN LEFT` : `${Math.floor(m/60)}H ${String(m%60).padStart(2,'0')}M LEFT`;
  };

  let lastGoodAlerts = [];
  async function refreshAlertsV66() {
    try {
      const r = await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`, {cache:'no-store', headers:{Accept:'application/geo+json,application/json'}});
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      const items = (data.features || []).filter(ongoing);
      if (items.length || Array.isArray(data.features)) lastGoodAlerts = items;
      const fresh = sort(lastGoodAlerts.filter(ongoing));
      if (typeof alertState !== 'undefined') {
        alertState.national = fresh;
        alertState.lastSuccessMs = Date.now();
        alertState.lastUpdated = new Date();
      }
      renderTickerV66(fresh);
      if (typeof renderAlertCards === 'function' && $('#alertsBox')) renderAlertCards();
      const u = $('#alertsUpdated');
      if (u) u.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} • live NWS feed`;
    } catch (e) {
      const fresh = sort(lastGoodAlerts.filter(ongoing));
      if (typeof alertState !== 'undefined') alertState.national = fresh;
      renderTickerV66(fresh, true);
      const u = $('#alertsUpdated');
      if (u) u.textContent = fresh.length ? 'NWS refresh delayed • showing current active alerts' : 'NWS alert feed temporarily unavailable • retrying';
      console.warn('TRGTornado v66 alert refresh delayed', e);
    }
  }

  function renderTickerV66(items, delayed=false) {
    const track = $('#alertTickerTrack');
    if (!track) return;
    const top = sort(items.filter(ongoing)).slice(0,12);
    if (!top.length) {
      track.innerHTML = `<span class="ticker-item ${delayed ? 'ticker-error' : 'ticker-clear'}"><span class="ticker-badge">${delayed ? 'NWS ALERTS' : 'ALL CLEAR'}</span> ${delayed ? 'Connecting to the live warning feed…' : 'No active NWS warnings or watches in the current feed.'}</span>`;
      track.style.removeProperty('--ticker-distance');
      return;
    }
    const build = list => list.map(item => {
      const p=item.properties||{}, cls=alertClass(p.event), left=remaining(p.expires);
      return `<button class="ticker-item ${cls}" type="button" data-alert-id="${esc(item.id||'')}"><span class="ticker-badge">${esc(p.event||'WEATHER ALERT')}</span><span class="ticker-area">${esc(area(p))}</span>${left?`<span class="ticker-time">${esc(left)}</span>`:''}</button>`;
    }).join('<span class="ticker-separator">•</span>');
    track.innerHTML = build(top) + '<span class="ticker-separator ticker-loop-gap">•</span>' + build(top);
    requestAnimationFrame(() => track.style.setProperty('--ticker-distance', `${Math.max(track.scrollWidth/2,900)}px`));
    track.querySelectorAll('[data-alert-id]').forEach(btn => btn.addEventListener('click', () => {
      const item=top.find(x=>String(x.id)===String(btn.dataset.alertId));
      const url=item?.properties?.web;
      if(url) window.open(url,'_blank','noopener'); else location.href='alerts.html';
    }));
  }

  // Replace the old refresh function without changing the rest of the site.
  window.loadNationalAlerts = refreshAlertsV66;
  window.renderTicker = () => renderTickerV66(typeof alertState !== 'undefined' ? alertState.national : lastGoodAlerts);

  const style = document.createElement('style');
  style.textContent = `
    .ticker-item.tornado .ticker-badge,.ticker-item.emergency .ticker-badge{color:#ff3030!important}
    .ticker-item.severe .ticker-badge,.ticker-item.warning .ticker-badge{color:#ff7a00!important}
    .ticker-item.flash .ticker-badge{color:#49a8ff!important}
    .ticker-item.watch .ticker-badge{color:#ffd52e!important}
    .ticker-item.statement .ticker-badge{color:#a78bfa!important}
    .ticker-item.advisory .ticker-badge{color:#8ca4b8!important}
    .ticker-item.emergency{border-color:#ff303066!important}.ticker-item.tornado{border-color:#ff303044!important}
    .ticker-item.severe,.ticker-item.warning{border-color:#ff7a0044!important}.ticker-item.flash{border-color:#49a8ff44!important}.ticker-item.watch{border-color:#ffd52e44!important}
    .spc-map,.spc-product-map{position:relative;background:#11151d!important;overflow:hidden}
    .spc-map .leaflet-container,.spc-product-map .leaflet-container{width:100%;height:100%;background:#11151d}
    .spc-map .leaflet-control-zoom,.spc-product-map .leaflet-control-zoom{z-index:1000}
    .spc-v66-toolbar{position:absolute;z-index:1100;right:10px;top:10px;display:flex;gap:4px}
    .spc-v66-toolbar button{width:30px;height:30px;border:1px solid #ff303055;border-radius:5px;background:#0b0e15;color:#fff;font-weight:900;cursor:pointer}
    .spc-v66-toolbar button:hover{background:#ff3030;color:#05050a}
  `;
  document.head.appendChild(style);

  const SPC66 = {
    base:'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer',
    layers:{categorical:1,tornado:3,tornadoCig:2,hail:5,hailCig:4,wind:7,windCig:6}
  };
  const color = (key, value) => {
    const n=Number(value);
    if(key==='categorical') return ({2:'#c7e9c0',3:'#62a45f',4:'#ffe45c',5:'#ff9b57',6:'#e46a62',8:'#d78ad7'}[n]||'#d9d9d9');
    return ({2:'#c7e9c0',5:'#ff9b57',10:'#ffe45c',15:'#e46a62',25:'#d78ad7'}[n]||'#d9d9d9');
  };
  const exportUrl = (layer, bounds, size) => {
    const sw=bounds.getSouthWest(), ne=bounds.getNorthEast();
    const x=lon=>lon*20037508.34/180;
    const y=lat=>Math.log(Math.tan((90+lat)*Math.PI/360))/(Math.PI/180)*20037508.34/180;
    const params=new URLSearchParams({bbox:`${x(sw.lng)},${y(sw.lat)},${x(ne.lng)},${y(ne.lat)}`,bboxSR:'3857',imageSR:'3857',size:`${Math.min(1600,Math.max(700,size.x))},${Math.min(1000,Math.max(350,size.y))}`,format:'png32',transparent:'true',layers:`show:${layer}`,f:'image',dpi:'96'});
    return `${SPC66.base}/export?${params}`;
  };
  function buildSpcMap(boxId,statusId,key,label){
    const box=document.getElementById(boxId), status=document.getElementById(statusId);
    if(!box || !window.L) return;
    box.innerHTML='';
    const map=L.map(box,{zoomControl:false,attributionControl:true,scrollWheelZoom:true,doubleClickZoom:true,dragging:true,touchZoom:true}).setView([38,-96],4);
    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',{maxZoom:8,attribution:'USGS'}).addTo(map);
    L.control.zoom({position:'topright'}).addTo(map);
    const bar=document.createElement('div');bar.className='spc-v66-toolbar';bar.innerHTML='<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button><button type="button" aria-label="Reset view">⌂</button>';box.appendChild(bar);
    const bs=bar.querySelectorAll('button');bs[0].onclick=e=>{e.stopPropagation();map.zoomIn()};bs[1].onclick=e=>{e.stopPropagation();map.zoomOut()};bs[2].onclick=e=>{e.stopPropagation();map.setView([38,-96],4)};
    let overlay=L.imageOverlay('',[[-90,-180],[90,180]],{opacity:0.94,interactive:false});
    overlay.addTo(map);
    const update=()=>{const url=exportUrl(SPC66.layers[key],map.getBounds(),map.getSize());overlay.setUrl(url);};
    let timer;
    map.on('moveend zoomend resize',()=>{clearTimeout(timer);timer=setTimeout(update,250)});
    requestAnimationFrame(()=>{map.invalidateSize(false);update()});
    setTimeout(()=>map.invalidateSize(false),300);
    if(status) status.innerHTML=`Live NOAA/SPC ${esc(label)} • interactive map • refreshed ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }
  function loadSPCV66(){
    buildSpcMap('spcCatMap','spcCatStatus','categorical','SPC Day 1 categorical outlook');
    buildSpcMap('spcTornMap','spcTornStatus','tornado','tornado probability');
    buildSpcMap('spcWindMap','spcWindStatus','wind','wind probability');
    buildSpcMap('spcHailMap','spcHailStatus','hail','hail probability');
  }

  function fixExistingMaps(){
    document.querySelectorAll('.leaflet-container').forEach(el=>{try{el._leaflet_map?.invalidateSize(false)}catch{}});
    if(typeof SPC!=='undefined' && SPC.maps) Object.values(SPC.maps).forEach(m=>{try{m.invalidateSize(false)}catch{}});
    if(typeof state!=='undefined' && state.map){try{state.map.invalidateSize(false)}catch{}}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{
      refreshAlertsV66();
      if($('#spcCatMap')) loadSPCV66();
      fixExistingMaps();
    },80);
    setTimeout(fixExistingMaps,500);
    setTimeout(fixExistingMaps,1500);
    window.addEventListener('resize',()=>setTimeout(fixExistingMaps,100));
    setInterval(refreshAlertsV66,60000);
    if($('#spcCatMap')) setInterval(loadSPCV66,300000);
  });
})();
