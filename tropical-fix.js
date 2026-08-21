/* Tropical-tab-only recovery: use the live NHC latest PNGs directly. No interactive NHC product is required. */
(() => {
  const sources={
    atl:{title:"ATLANTIC 7-DAY OUTLOOK",source:"NOAA / NHC",image:"https://www.nhc.noaa.gov/archive/xgtwo/atl/latest/two_atl_7d0.png",url:"https://www.nhc.noaa.gov/archive/xgtwo/atl/latest/"},
    epac:{title:"EAST PACIFIC 7-DAY OUTLOOK",source:"NOAA / NHC",image:"https://www.nhc.noaa.gov/archive/xgtwo/epac/latest/two_epac_7d0.png",url:"https://www.nhc.noaa.gov/archive/xgtwo/epac/latest/"},
    cpac:{title:"CENTRAL PACIFIC 7-DAY OUTLOOK",source:"NOAA / CPHC",image:"https://www.nhc.noaa.gov/archive/xgtwo/cpac/latest/two_cpac_7d0.png",url:"https://www.nhc.noaa.gov/archive/xgtwo/cpac/latest/"}
  };
  const img=document.getElementById("tropicalImage"), viewer=document.getElementById("tropicalViewer"), fallback=document.getElementById("tropicalFallback"), updated=document.getElementById("tropicalUpdated");
  if(!img||!viewer) return;
  const tabs=[...document.querySelectorAll(".tropical-tabs .tab")];
  tabs.forEach(old=>{const b=old.cloneNode(true);old.replaceWith(b);b.addEventListener("click",()=>load(b.dataset.tropical));});
  function load(key){
    const s=sources[key];
    if(!s){document.getElementById("tropicalWpac")?.style.setProperty("display","flex");viewer.style.display="none";return;}
    document.getElementById("tropicalWpac")?.style.setProperty("display","none");viewer.style.display="flex";img.style.display="block";if(fallback)fallback.style.display="none";
    document.getElementById("tropicalTitle").textContent=s.title;document.getElementById("tropicalSource").textContent=s.source;
    document.getElementById("tropicalHeadline").textContent=s.title.replace("7-DAY OUTLOOK","Tropical Outlook");
    document.getElementById("tropicalText").textContent="Live 7-day graphical outlook from the official NHC/CPHC latest product.";
    document.getElementById("tropicalStoryLink").href=s.url;document.getElementById("tropicalOpen").href=s.url;document.getElementById("tropicalFallbackLink").href=s.url;
    if(updated)updated.textContent="Loading live official NHC graphic…";
    img.onload=()=>{if(updated)updated.textContent="LIVE • Direct official NHC graphic";};
    img.onerror=()=>{img.style.display="none";if(fallback)fallback.style.display="block";if(updated)updated.textContent="NHC graphic unavailable right now • open official archive";};
    img.src=s.image+"?trg="+Date.now();
  }
  const note=document.querySelector(".tropical-source-note");if(note)note.textContent="Version 65 • Live NHC/CPHC latest still • direct official source";
  load(document.querySelector(".tropical-tabs .tab.active")?.dataset.tropical||"atl");
})();
