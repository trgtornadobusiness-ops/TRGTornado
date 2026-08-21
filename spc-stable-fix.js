/* TRGTornado SPC stable renderer
   Uses NOAA/SPC MapServer export images inside Leaflet.
   The map remains fully interactive (pan/zoom) while the official SPC
   outlook polygons are rendered by NOAA's own map service. */
(() => {
  const MAPS = [
    ["spcCatMap", "spcCatStatus", "SPC Categorical Outlook", "1"],
    ["spcTornMap", "spcTornStatus", "Tornado Probability + CIG", "2,3"],
    ["spcWindMap", "spcWindStatus", "Wind Probability + CIG", "6,7"],
    ["spcHailMap", "spcHailStatus", "Hail Probability + CIG", "4,5"]
  ];
  const BASE = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/export";
  const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const maps = new Map();
  const timers = new Map();

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  function exportUrl(map, layers) {
    const b = map.getBounds();
    const s = map.getSize();
    const params = new URLSearchParams({
      bbox: `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,
      bboxSR: "4326",
      imageSR: "4326",
      size: `${Math.max(600, Math.min(1800, Math.round(s.x * devicePixelRatio)))},${Math.max(300, Math.min(1100, Math.round(s.y * devicePixelRatio)))}`,
      layers: `show:${layers}`,
      format: "png32",
      transparent: "true",
      dpi: "96",
      f: "image",
      _trg: Date.now().toString()
    });
    return `${BASE}?${params.toString()}`;
  }

  function makeMap(mapId) {
    const el = $(mapId);
    if (!el || !window.L) return null;
    const old = maps.get(mapId);
    if (old) { try { old.remove(); } catch {} }
    el.innerHTML = "";
    el.classList.remove("map-error");
    el.style.background = "#10141c";

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
      preferCanvas: false
    }).setView([38, -96], 4);

    L.tileLayer(OSM, {
      maxZoom: 18,
      minZoom: 2,
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const layer = L.imageOverlay("", [[24.0, -125.0], [50.0, -66.0]], {
      opacity: 1,
      interactive: false,
      zIndex: 20
    }).addTo(map);

    map._trgSpcOverlay = layer;
    maps.set(mapId, map);
    if (window.SPC?.maps) window.SPC.maps[mapId] = map;
    return map;
  }

  function refresh(mapId, statusId, label, layers) {
    const map = maps.get(mapId);
    const status = $(statusId);
    if (!map) return;
    const url = exportUrl(map, layers);
    const img = new Image();
    img.onload = () => {
      const b = map.getBounds();
      map._trgSpcOverlay.setUrl(url);
      map._trgSpcOverlay.setBounds(b);
      map._trgSpcOverlay.bringToFront();
      if (status) status.innerHTML = `Live NOAA/SPC ${esc(label)} • refreshed ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} • <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open SPC</a>`;
      $(mapId)?.classList.remove("map-error");
    };
    img.onerror = () => {
      if (status) status.innerHTML = `${esc(label)} temporarily unavailable. <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener">Open official SPC</a>`;
      $(mapId)?.classList.add("map-error");
    };
    img.src = url;
  }

  function install(item) {
    const [mapId, statusId, label, layers] = item;
    const map = makeMap(mapId);
    if (!map) return;
    const redraw = () => {
      clearTimeout(timers.get(mapId));
      timers.set(mapId, setTimeout(() => refresh(mapId, statusId, label, layers), 180));
    };
    map.on("moveend zoomend resize", redraw);
    refresh(mapId, statusId, label, layers);
    setTimeout(() => map.invalidateSize(false), 150);
    setTimeout(() => map.invalidateSize(false), 700);
  }

  function installAll() {
    if (!window.L || !$("spcCatMap")) return;
    MAPS.forEach(install);
  }

  const style = document.createElement("style");
  style.textContent = `
    .spc-map,.spc-product-map{overflow:hidden!important;position:relative!important;background:#10141c!important}
    .spc-map .leaflet-container,.spc-product-map .leaflet-container{width:100%!important;height:100%!important;background:#10141c!important}
    .spc-map .leaflet-control-zoom,.spc-product-map .leaflet-control-zoom{z-index:1000!important}
  `;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(installAll, 1200);
    setInterval(installAll, 295000);
  });
})();
