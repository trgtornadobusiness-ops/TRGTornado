/* TRG V67 Severe map-control fix.
   Keeps Leaflet zoom controls inside each SPC map and prevents the '#' zoom
   links from changing the page scroll position. Does not alter map layers. */
(() => {
  const containers = ['spcCatMap','spcTornMap','spcWindMap','spcHailMap'];
  const fix = () => {
    containers.forEach(id => {
      const el=document.getElementById(id); if(!el) return;
      el.style.position='relative';
      el.style.overflow='hidden';
      const controls=el.querySelector('.leaflet-control-container');
      if(controls){ controls.style.position='absolute'; controls.style.inset='0'; controls.style.pointerEvents='none'; }
      el.querySelectorAll('.leaflet-top,.leaflet-bottom').forEach(group=>{group.style.position='absolute';group.style.zIndex='1000';group.style.pointerEvents='none'});
      el.querySelectorAll('.leaflet-top.leaflet-left').forEach(x=>{x.style.top='10px';x.style.left='10px'});
      el.querySelectorAll('.leaflet-top.leaflet-right').forEach(x=>{x.style.top='10px';x.style.right='10px'});
      el.querySelectorAll('.leaflet-bottom.leaflet-left').forEach(x=>{x.style.bottom='10px';x.style.left='10px'});
      el.querySelectorAll('.leaflet-bottom.leaflet-right').forEach(x=>{x.style.bottom='10px';x.style.right='10px'});
      el.querySelectorAll('.leaflet-control').forEach(x=>x.style.pointerEvents='auto');
      el.querySelectorAll('.leaflet-control-zoom').forEach(x=>{x.style.position='relative';x.style.top='0';x.style.left='0';x.style.margin='0'});
    });
  };
  document.addEventListener('click',e=>{
    const zoom=e.target.closest?.('.leaflet-control-zoom a');
    if(zoom){e.preventDefault();e.stopPropagation();}
  },true);
  window.addEventListener('scroll',()=>requestAnimationFrame(fix),{passive:true});
  window.addEventListener('resize',()=>requestAnimationFrame(fix));
  const observer=new MutationObserver(fix); observer.observe(document.body,{subtree:true,childList:true});
  fix(); setTimeout(fix,250); setTimeout(fix,1000); setInterval(fix,2000);
})();
