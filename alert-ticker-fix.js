/* TRG LIVE ALERT TICKER — standalone renderer. No dependency on app.js ticker code. */
(()=>{
  const track=document.getElementById('alertTickerTrack');
  if(!track)return;
  const css=document.createElement('style');css.id='trgTickerCSS';css.textContent=`
.alert-ticker{position:relative;z-index:950;display:flex;align-items:stretch;height:44px;background:#090b10;border-bottom:1px solid #ff303044;color:#fff;overflow:hidden}.ticker-label{flex:0 0 auto;display:flex;align-items:center;padding:0 13px;font-size:10px;font-weight:1000;letter-spacing:1.2px;border-right:1px solid #ff303044}.ticker-dot{width:7px;height:7px;border-radius:50%;background:#ff3030;box-shadow:0 0 9px #ff3030;margin-right:7px}.ticker-window{position:relative;flex:1;min-width:0;overflow:hidden}.ticker-track{display:flex;align-items:center;gap:10px;width:max-content;min-height:44px;white-space:nowrap;will-change:transform;animation:trgTicker 45s linear infinite}.ticker-track:hover{animation-play-state:paused}.ticker-item{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px;background:#0d1017;border:1px solid #ffffff20;border-radius:5px;color:#fff;cursor:pointer;font-size:10px;font-weight:800;white-space:nowrap}.ticker-item:hover{filter:brightness(1.2)}.ticker-badge{font-size:9px;font-weight:1000;letter-spacing:.5px}.ticker-area{color:#c8ccd6}.ticker-time{color:#9aa1b1;font-size:9px}.ticker-separator{color:#ff3030;font-weight:1000}.ticker-button{flex:0 0 auto;display:flex;align-items:center;padding:0 13px;border-left:1px solid #ff303044;color:#ff6262;font-size:9px;font-weight:1000}.ticker-clear{cursor:default;color:#aeb4c4}.ticker-loading{color:#aeb4c4;cursor:default}@keyframes trgTicker{from{transform:translateX(0)}to{transform:translateX(calc(-1 * var(--ticker-distance,900px)))}}@media(max-width:700px){.alert-ticker{height:40px}.ticker-label{padding:0 8px;font-size:8px}.ticker-button{display:none}.ticker-track{min-height:40px}.ticker-item{height:27px;font-size:9px}}
`;
  document.head.appendChild(css);
  const EVENTS=new Set(['Tornado Warning','Tornado Emergency','Severe Thunderstorm Warning','Extreme Wind Warning','Flash Flood Warning','Flash Flood Emergency','Tornado Watch','Severe Thunderstorm Watch','Special Weather Statement','Severe Weather Statement']);
  const rank={tornado:1000,severe:900,flash:800,watch:700,statement:600,advisory:500};
  const color={tornado:'#ef4444',severe:'#f97316',flash:'#22c55e',watch:'#ffd52e',statement:'#a78bfa',advisory:'#60a5fa'};
  const label={tornado:'TORNADO',severe:'SEVERE',flash:'FLASH FLOOD',watch:'WATCH',statement:'STATEMENT',advisory:'ADVISORY'};
  const icon={tornado:'!',severe:'!',flash:'!',watch:'W',statement:'S',advisory:'A'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kind=e=>{e=String(e||'').toLowerCase();if(e.includes('tornado emergency')||e.includes('tornado warning'))return'tornado';if(e.includes('severe thunderstorm warning')||e.includes('extreme wind warning'))return'severe';if(e.includes('flash flood warning')||e.includes('flash flood emergency'))return'flash';if(e.includes('watch'))return'watch';if(e.includes('statement'))return'statement';return'advisory'};
  const ongoing=p=>{const exp=Date.parse(p?.expires||p?.ends||'');const status=String(p?.status||'Actual').toLowerCase();const type=String(p?.messageType||'Alert').toLowerCase();return(status==='actual'||status==='active')&&type!=='cancel'&&(!Number.isFinite(exp)||exp>Date.now())};
  const area=p=>String(p?.areaDesc||'Active NWS area').split(';').map(x=>x.trim()).filter(Boolean).slice(0,3).join(' • ');
  let latest=[];let internal=false;
  function render(features){
    latest=(features||[]).filter(f=>EVENTS.has(String(f?.properties?.event||'').trim())&&ongoing(f.properties));
    latest.sort((a,b)=>rank[kind(b.properties?.event)]-rank[kind(a.properties?.event)]);
    const list=latest.slice(0,15);
    internal=true;
    if(!list.length){track.innerHTML='<span class="ticker-item ticker-clear">NO TARGET ALERTS ACTIVE</span>';track.style.setProperty('--ticker-distance','900px');internal=false;return;}
    const build=arr=>arr.map(f=>{const p=f.properties||{},k=kind(p.event),c=color[k],considerable=k==='severe'&&/considerable/i.test(`${p.headline||''} ${p.description||''} ${p.instruction||''}`),ms=Date.parse(p.expires||'')-Date.now(),mins=Number.isFinite(ms)?Math.max(1,Math.floor(ms/60000)):null,time=mins==null?'':mins<60?`${mins} MIN LEFT`:`${Math.floor(mins/60)}H ${String(mins%60).padStart(2,'0')}M LEFT`;return `<button type="button" class="ticker-item ${k}${considerable?' considerable':''}" data-alert-id="${esc(f.id||'')}" style="border-color:${c};color:${c}"><span class="ticker-badge" style="color:${c}">${icon[k]} ${esc(considerable?'CONSIDERABLE':label[k])}</span><span class="ticker-area">${esc(area(p))}</span>${time?`<span class="ticker-time">${time}</span>`:''}</button>`}).join('<span class="ticker-separator">•</span>');
    track.innerHTML=build(list)+'<span class="ticker-separator">•</span>'+build(list);
    requestAnimationFrame(()=>{track.style.setProperty('--ticker-distance',`${Math.max(track.scrollWidth/2,900)}px`);track.style.animation='none';void track.offsetWidth;track.style.animation='trgTicker 45s linear infinite'});
    internal=false;
  }
  async function refresh(){try{const r=await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/geo+json'}});if(!r.ok)throw new Error(r.status);const d=await r.json();render(d.features||[])}catch(e){console.warn('TRG ticker failed',e)}}
  track.addEventListener('click',e=>{const b=e.target.closest?.('[data-alert-id]');if(b?.dataset.alertId){e.preventDefault();location.href='maps.html?alert='+encodeURIComponent(b.dataset.alertId)}});
  new MutationObserver(()=>{if(internal)return;const bad=[...track.querySelectorAll('.ticker-item')].some(n=>/\bFLOOD WARNING\b/i.test(n.textContent||'')&&!/FLASH FLOOD/i.test(n.textContent||''));if(bad)render(latest)}).observe(track,{childList:true,subtree:true});
  refresh();setInterval(refresh,60000);
})();
