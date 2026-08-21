/* Route Weather Alerts cards into the TRG Radar warning focus view. */
(()=>{
  document.addEventListener('click',async e=>{
    const card=e.target.closest?.('a.alert'); if(!card)return;
    e.preventDefault();
    const event=card.querySelector('.alert-title-row strong')?.textContent?.trim()||'';
    const areas=card.querySelector('.alert-location span')?.textContent?.trim()||'';
    try{
      const r=await fetch('https://api.weather.gov/alerts/active?limit=5000&_trg_card='+Date.now(),{cache:'no-store',headers:{Accept:'application/geo+json,application/json'}});
      const d=await r.json();
      const f=(d.features||[]).find(x=>{
        const p=x.properties||{}; const area=String(p.areaDesc||'');
        return p.event===event && (!areas || areas.split(' • ').some(a=>area.includes(a)));
      });
      location.href='maps.html'+(f?.id?'?alert='+encodeURIComponent(f.id):'');
    }catch(_){location.href='maps.html'}
  },true);
})();
