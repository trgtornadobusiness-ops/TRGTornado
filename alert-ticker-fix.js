/* TRG alert ticker patch v3: one isolated target-only data source; app.js cannot reinsert Flood Warnings. */
(() => {
  const track=document.getElementById('alertTickerTrack'); if(!track)return;
  const EVENTS=new Set(['Tornado Warning','Tornado Emergency','Severe Thunderstorm Warning','Extreme Wind Warning','Flash Flood Warning','Flash Flood Emergency','Tornado Watch','Severe Thunderstorm Watch','Special Weather Statement','Severe Weather Statement']);
  const rank={tornado:1000,severe:900,flash:800,watch:700,statement:600,advisory:500};
  const color={tornado:'#ef4444',severe:'#f97316',flash:'#22c55e',watch:'#ffd52e',statement:'#a78bfa',advisory:'#60a5fa'};
  const label={tornado:'TORNADO',severe:'SEVERE',flash:'FLASH FLOOD',watch:'WATCH',statement:'STATEMENT',advisory:'ADVISORY'};
  const icon={tornado:'!',severe:'!',flash:'!',watch:'W',statement:'S',advisory:'A'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kind=e=>{e=String(e||'').toLowerCase();if(e.includes('tornado emergency')||e.includes('tornado warning'))return'tornado';if(e.includes('severe thunderstorm warning')||e.includes('extreme wind warning'))return'severe';if(e.includes('flash flood warning')||e.includes('flash flood emergency'))return'flash';if(e.includes('watch'))return'watch';if(e.includes('statement'))return'statement';return'advisory'};
  const ongoing=p=>{const s=String(p?.status||'Actual').toLowerCase(),m=String(p?.messageType||'Alert').toLowerCase(),eff=Date.parse(p?.effective||p?.onset||p?.sent||''),exp=Date.parse(p?.expires||p?.ends||'');return(s==='actual'||s==='active')&&m!=='cancel'&&(!Number.isFinite(eff)||eff<=Date.now())&&(!Number.isFinite(exp)||exp>Date.now())};
  const area=p=>String(p?.areaDesc||'Active NWS area').split(';').map(x=>x.trim()).filter(Boolean).slice(0,2).join(' • ');
  let latest=[];
  function render(features){
    const items=(features||[]).filter(f=>EVENTS.has(String(f?.properties?.event||'').trim())&&ongoing(f.properties));
    items.sort((a,b)=>rank[kind(b.properties?.event)]-rank[kind(a.properties?.event)]||Date.parse(a.properties?.expires||'')-Date.parse(b.properties?.expires||''));latest=items;
    if(!items.length){track.innerHTML='<span class="ticker-item ticker-clear"><span class="ticker-badge">NO TARGET ALERTS</span> No active target alerts.</span>';return;}
    const build=list=>list.map(f=>{const p=f.properties||{},k=kind(p.event),c=color[k],considerable=k==='severe'&&/considerable/i.test(`${p.headline||''} ${p.description||''} ${p.instruction||''}`),badge=considerable?'CONSIDERABLE':label[k],ms=Date.parse(p.expires||'')-Date.now(),mins=Number.isFinite(ms)?Math.max(1,Math.floor(ms/60000)):null,time=mins==null?'':mins<60?`${mins} MIN LEFT`:`${Math.floor(mins/60)}H ${String(mins%60).padStart(2,'0')}M LEFT`;return `<span class="ticker-item ${k}${considerable?' considerable':''}" style="border-color:${c};color:${c}"><span class="ticker-badge" style="color:${c};border-color:${c}">${icon[k]} ${esc(badge)}</span><span class="ticker-area">${esc(area(p))}</span>${time?`<span class="ticker-time">${time}</span>`:''}</span>`}).join('<span class="ticker-separator">•</span>');
    const top=items.slice(0,12);track.innerHTML=build(top)+'<span class="ticker-separator ticker-loop-gap">•</span>'+build(top);requestAnimationFrame(()=>track.style.setProperty('--ticker-distance',`${Math.max(track.scrollWidth/2,900)}px`));
  }
  async function refresh(){try{const r=await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg_ticker_v3=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/geo+json,application/json'}});if(!r.ok)throw new Error(`${r.status}`);const d=await r.json();render(Array.isArray(d.features)?d.features:[])}catch(e){console.warn('TRG ticker refresh failed',e)}}
  // app.js calls this name too; make it render our already-filtered feed instead of its own feed.
  window.renderTicker=()=>render(latest);
  refresh();setInterval(refresh,60000);
})();
