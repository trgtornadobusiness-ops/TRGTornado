/* Severe-page-only recovery: replace broken SPC map widgets with direct official SPC graphics. */
(() => {
  const products = [
    {id:"spcCatMap", status:"spcCatStatus", src:"https://www.spc.noaa.gov/products/outlook/day1otlk.png", label:"Official SPC Day 1 categorical outlook"},
    {id:"spcTornMap", status:"spcTornStatus", src:"https://www.spc.noaa.gov/products/outlook/day1probotlk_torn.png", fallback:"https://www.spc.noaa.gov/products/outlook/day1probotlk.png", label:"Official SPC Day 1 tornado probability outlook"},
    {id:"spcWindMap", status:"spcWindStatus", src:"https://www.spc.noaa.gov/products/outlook/day1probotlk_wind.png", fallback:"https://www.spc.noaa.gov/products/outlook/day1probotlk.png", label:"Official SPC Day 1 wind probability outlook"},
    {id:"spcHailMap", status:"spcHailStatus", src:"https://www.spc.noaa.gov/products/outlook/day1probotlk_hail.png", fallback:"https://www.spc.noaa.gov/products/outlook/day1probotlk.png", label:"Official SPC Day 1 hail probability outlook"}
  ];
  products.forEach(p => {
    const box=document.getElementById(p.id), status=document.getElementById(p.status);
    if(!box) return;
    box.innerHTML="";
    const img=document.createElement("img");
    img.alt=p.label; img.loading="eager"; img.decoding="async";
    img.style.cssText="display:block;width:100%;height:auto;max-height:560px;object-fit:contain;background:#0b0d10;border-radius:8px;";
    let triedFallback=false;
    img.onload=()=>{if(status)status.textContent="LIVE • Official SPC graphic";};
    img.onerror=()=>{
      if(!triedFallback && p.fallback){triedFallback=true;img.src=p.fallback+"?v="+Date.now();return;}
      if(status)status.textContent="SPC graphic unavailable right now • open spc.noaa.gov for the current product";
      img.style.display="none";
    };
    img.src=p.src+"?v="+Date.now();
    box.appendChild(img);
  });
})();
