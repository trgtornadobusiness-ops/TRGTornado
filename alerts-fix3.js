/* TRG Alert Center v5
   Direct NWS feed with NOAA GIS fallback. A temporary fetch failure or empty
   response never wipes the last confirmed active alerts.
*/
(() => {
  const box=document.getElementById('alertsBox'); if(!box)return;
  const EVENTS=new Set(['Tornado Warning','Tornado Emergency','Severe Thunderstorm Warning','Extreme Wind Warning','Flash Flood Warning','Flash Flood Emergency','Tornado Watch','Severe Thunderstorm Watch','Special Weather Statement','Severe Weather Statement']);
  const state={items:[],filter:'all',page:1,perPage:20,lastGood:[]};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const type=e=>{const x=String(e||'').toLowerCase();if(x.includes('tornado emergency')||x.includes('tornado warning'))return'tornado';if(x.includes('severe thunderstorm warning')||x.includes('extreme wind warning'))return'severe';if(x.includes('flash flood warning')||x.includes('flash flood emergency'))return'flash';if(x.includes('watch'))return'watch';if(x.includes('statement'))return'statement';return'advisory'};
  const rank={tornado:1000,severe:900,flash:800,watch:700,statement:600,advisory:500};
  const ongoing=p=>{const s=String(p?.status||'Actual').toLowerCase(),m=String(p?.messageType||'Alert').toLowerCase(),eff=Date.parse(p?.effective||p?.onset||p?.sent||''),exp=Date.parse(p?.expires||p?.ends||'');return(s==='actual'||s==='active')&&m!=='cancel'&&(!Number.isFinite(eff)||eff<=Date.now())&&(!Number.isFinite(exp)||exp>Date.now())};
  const target=f=>EVENTS.has(String(f?.properties?.event||'').trim())&&ongoing(f.properties);
  const matches=(item,filter)=>filter==='all'||(filter==='warning'?['tornado','severe','flash'].includes(type(item.properties?.event)):type(item.properties?.event)===filter);
  const sorted=a=>[...a].sort((x,y)=>rank[type(y.properties?.event)]-rank[type(x.properties?.event)]||Date.parse(x.properties?.expires||'')-Date.parse(y.properties?.expires||''));

  function render(){
    const list=sorted(state.items.filter(x=>target(x)&&matches(x,state.filter)));
    const pages=Math.max(1,Math.ceil(list.length/state.perPage)); state.page=Math.min(state.page,pages);
    const start=(state.page-1)*state.perPage,visible=list.slice(start,start+state.perPage);
    box.innerHTML=visible.length?visible.map((x,i)=>{const p=x.properties||{},k=type(p.event),considerable=k==='severe'&&/considerable/i.test(`${p.headline||''} ${p.description||''}`),color=k==='tornado'?'#ef4444':k==='severe'?'#f97316':k==='flash'?'#22c55e':k==='watch'?'#ffd52e':k==='statement'?'#a78bfa':'#60a5fa',href=/^https:\/\//i.test(p.web||'')?p.web:'https://www.weather.gov/alerts',issued=p.sent||p.effective||p.onset,expires=p.expires||p.ends,area=String(p.areaDesc||'Active NWS area').split(';').slice(0,3).join(' • '),it=issued?new Date(issued).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown',et=expires?new Date(expires).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown';return`<a class="alert ${k} ${considerable?'alert-considerable':''}" style="border-color:${color}!important;box-shadow:0 0 0 1px ${color}22 inset" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><div class="alert-rank">${start+i+1}</div><div class="alert-icon" style="background:${color}">${k==='watch'?'W':k==='statement'?'S':k==='advisory'?'A':'!'}</div><div class="alert-body"><div class="alert-title-row"><strong>${esc(p.event||'Weather Alert')}</strong><span class="alert-priority">${esc(p.severity||'Unknown')} • ${esc(p.urgency||'Unknown')}</span></div><span>${esc(p.headline||p.event||'')}</span><small>${esc(area)} · Issued ${esc(it)} · Expires ${esc(et)}</small></div></a>`}).join(''):`<div class="empty"><strong>No ${state.filter==='all'?'target':state.filter} alerts found.</strong><br><small>Flood Warnings and other non-target products are excluded.</small></div>`;
    let pager=document.getElementById('trgAlertPager'); if(!pager){pager=document.createElement('div');pager.id='trgAlertPager';pager.className='trg-alert-pager';box.after(pager)}
    pager.innerHTML=pages>1?`<button type="button" id="trgPrev" ${state.page===1?'disabled':''}>← PREVIOUS</button><span>PAGE ${state.page} OF ${pages} • ${list.length} ALERTS</span><button type="button" id="trgNext" ${state.page===pages?'disabled':''}>NEXT →</button>`:`<span>${list.length} ACTIVE TARGET ALERT${list.length===1?'':'S'} • FLOOD WARNINGS EXCLUDED</span>`;
    document.getElementById('trgPrev')?.addEventListener('click',()=>{state.page--;render()}); document.getElementById('trgNext')?.addEventListener('click',()=>{state.page++;render()});
    const severe=state.items.filter(x=>target(x)&&type(x.properties?.event)==='severe').length,tornado=state.items.filter(x=>target(x)&&type(x.properties?.event)==='tornado').length,flash=state.items.filter(x=>target(x)&&type(x.properties?.event)==='flash').length,total=state.items.filter(target).length;
    document.getElementById('alertCount')?.replaceChildren(document.createTextNode(String(severe))); document.getElementById('localAlertCount')?.replaceChildren(document.createTextNode(String(total)));
    const u=document.getElementById('alertsUpdated');if(u)u.textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} • live NWS/NOAA feed`;
    const tag=document.getElementById('alertTag');if(tag){tag.textContent=`${total} ACTIVE`;tag.className='tag red'}
    const note=document.querySelector('.alert-summary-note');if(note)note.textContent=`${severe} severe thunderstorm warnings • ${tornado} tornado warnings • ${flash} flash flood warnings • generic Flood Warnings excluded.`;
  }

  async function getNws(){
    const r=await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/geo+json,application/json'}});
    if(!r.ok)throw new Error(`${r.status} ${r.statusText}`); const d=await r.json(); if(!Array.isArray(d.features))throw new Error('Invalid NWS response'); return d.features.filter(target);
  }
  async function getGis(layer){
    const q=new URLSearchParams({where:'1=1',outFields:'*',returnGeometry:'false',f:'json',resultRecordCount:'4000',orderByFields:'objectid ASC',_trg:String(Date.now())});
    const r=await fetch(`https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer/${layer}/query?${q}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(`NOAA GIS ${r.status}`); const d=await r.json();
    return (d.features||[]).map((f,i)=>{const a=f.attributes||{};const ph=String(a.phenom||a.PHENOM||'').toUpperCase(),sig=String(a.sig||a.SIG||'').toUpperCase();const names={'TO,W':'Tornado Warning','SV,W':'Severe Thunderstorm Warning','FF,W':'Flash Flood Warning','EW,W':'Extreme Wind Warning','TO,A':'Tornado Watch','SV,A':'Severe Thunderstorm Watch'};const event=a.prod_type||a.PROD_TYPE||a.event||names[`${ph},${sig}`]||'';const exp=a.expiration||a.EXPIRATION||a.expires||a.EXPIRES;const eff=a.onset||a.ONSET||a.issuance||a.ISSUANCE;return{id:String(a.cap_id||a.CAP_ID||a.id||`${layer}-${i}`),properties:{event,headline:a.headline||a.HEADLINE||event,areaDesc:a.areaDesc||a.AREADESC||a.county||a.zone||'Active NWS area',effective:eff?new Date(Number(eff)>1e11?Number(eff):Date.parse(eff)).toISOString():undefined,expires:exp?new Date(Number(exp)>1e11?Number(exp):Date.parse(exp)).toISOString():undefined,status:'Actual',messageType:'Alert',severity:a.severity||'Unknown',urgency:a.urgency||'Immediate',web:a.url||a.URL||'https://www.weather.gov/alerts'}}}).filter(target);
  }
  async function refresh(){
    try{
      let items=[]; try{items=await getNws()}catch(e){console.warn('NWS alerts failed, trying NOAA GIS',e)}
      if(!items.length){const [w,a]=await Promise.allSettled([getGis(0),getGis(1)]);items=[...(w.status==='fulfilled'?w.value:[]),...(a.status==='fulfilled'?a.value:[])];}
      // Empty live responses are not treated as an all-clear when we already have confirmed alerts.
      if(items.length){state.items=items;state.lastGood=items;state.page=1;render();}
      else if(state.lastGood.length){state.items=state.lastGood.filter(x=>ongoing(x.properties));render();}
      else render();
    }catch(e){console.warn('TRG alert refresh failed',e);state.items=state.lastGood.filter(x=>ongoing(x.properties));render();const u=document.getElementById('alertsUpdated');if(u)u.textContent='NWS/NOAA refresh delayed • showing last confirmed alerts'}
  }
  window.renderAlertCards=render; window.renderAlerts=data=>{state.items=(data?.features||[]).filter(target);state.lastGood=state.items;state.page=1;render()};
  document.querySelectorAll('.alert-filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.alert-filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.alertFilter||'all';state.page=1;render()}));
  document.getElementById('alertsRefresh')?.addEventListener('click',refresh); refresh(); setInterval(refresh,60000);
})();
