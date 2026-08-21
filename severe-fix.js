/* TRGTornado Severe Map Fix
   Keep the original interactive SPC Leaflet renderer. The actual baseline issue
   is that the SPC map containers have no height in styles.css and the original
   renderer uses a problematic USGS tile base. This repair only fixes the
   containers/base tiles after app.js creates the maps.
*/
(() => {
  const IDS = ["spcCatMap", "spcTornMap", "spcWindMap", "spcHailMap"];
  function repair() {
    IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.height = id === "spcCatMap" ? "430px" : "300px";
      el.style.minHeight = el.style.height;
      el.style.background = "#0b0e15";
    });
    if (!window.L || !window.SPC?.maps) return;
    IDS.forEach(id => {
      const map = window.SPC.maps[id];
      if (!map) return;
      map.eachLayer(layer => {
        if (layer?._url?.includes("basemap.nationalmap.gov")) map.removeLayer(layer);
      });
      if (!map._trgBase) {
        map._trgBase = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 8,
          attribution: "© OpenStreetMap contributors"
        }).addTo(map);
        map._trgBase.bringToBack();
      }
      map.invalidateSize(false);
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(repair, 1000);
    setTimeout(repair, 2500);
  });
})();
