from pathlib import Path
import re, zipfile, shutil, os
root=Path('/mnt/data/trg-site/v20')
app=root/'app.js'
s=app.read_text()
# Replace zip geocoder with Nominatim structured lookup (browser-readable) plus zippopotam fallback.
start=s.index('async function zipGeocode(zip) {')
end=s.index('\nasync function geocode(query)', start)
new='''async function zipGeocode(zip) {
  const clean = zip.match(/^\\d{5}/)?.[0];
  if (!clean) throw new Error("Enter a valid 5-digit ZIP code.");
  const urls = [
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(clean)}&country=United%20States&format=jsonv2&limit=1`,
    `https://api.zippopotam.us/us/${clean}`
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, {timeout:12000, headers:{Accept:"application/json"}});
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
        const p = data[0];
        return {latitude:Number(p.lat), longitude:Number(p.lon), name:p.display_name?.split(",")[0] || clean, admin1:p.address?.state || "", zip:clean, label:`${p.display_name || clean}`};
      }
      const place=data?.places?.[0];
      if (place) return {latitude:Number(place.latitude),longitude:Number(place.longitude),name:place["place name"]||clean,admin1:place["state abbreviation"]||place.state||"",zip:clean,label:`${place["place name"]||"ZIP"}, ${place["state abbreviation"]||""} ${clean}`.trim()};
      throw new Error("ZIP not found");
    } catch(e) { lastError=e; }
  }
  throw new Error(lastError?.message || "That ZIP code could not be located.");
}
'''
s=s[:start]+new+s[end:]
# Replace nwsAlerts function body by locating start and hazardName
start=s.index('async function nwsAlerts(point) {')
end=s.index('\nfunction hazardName', start)
new='''async function nwsAlerts(point) {
  const url = point
    ? `https://api.weather.gov/alerts/active?point=${encodeURIComponent(point.latitude)},${encodeURIComponent(point.longitude)}`
    : "https://api.weather.gov/alerts/active";
  const data = await fetchJson(url, {timeout:15000, headers:{Accept:"application/geo+json"}});
  return {features:(data.features || []).filter(isOngoingAlert)};
}
'''
s=s[:start]+new+s[end:]
# Alert type + render cards
s=s.replace('''function alertType(event="") {\n  const e = event.toLowerCase();\n  if (e.includes("warning") || e.includes("emergency")) return "warning";\n  if (e.includes("watch")) return "watch";\n  return "advisory";\n}''','''function alertType(event="") {
  const e = event.toLowerCase();
  if (e.includes("warning") || e.includes("emergency")) return "warning";
  if (e.includes("watch")) return "watch";
  if (e.includes("statement")) return "statement";
  return "advisory";
}''')
s=s.replace('''function renderAlertCards() {\n}''','''function renderAlertCards() {
  const box = $("#alertsBox");
  if (!box) return;
  const filtered = sortAlerts(alertState.national).filter(item => alertState.filter === "all" || alertType(item.properties?.event) === alertState.filter);
  if (!filtered.length) {
    const label = alertState.filter === "all" ? "active" : alertState.filter;
    box.innerHTML = `<div class="empty"><strong>No active ${escapeHtml(label)} alerts found.</strong><br><small>The live NWS feed currently has nothing in this category.</small></div>`;
    return;
  }
  box.innerHTML = filtered.map((item,index) => {
    const p=item.properties||{};
    const type=alertType(p.event);
    const cls=alertClass(p.event);
    const expires=alertRemaining(p.expires)||"ACTIVE";
    const areas=(p.areaDesc||"Active NWS area").split(";").map(x=>x.trim()).filter(Boolean).slice(0,4).join(" • ");
    const href=/^https:\\/\\//i.test(p.web||"")?p.web:"https://www.weather.gov/alerts";
    return `<a class="alert ${cls}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><div class="alert-rank">${index+1}</div><div class="alert-icon">${type==="warning"?"!":type==="watch"?"W":type==="statement"?"S":"i"}</div><div class="alert-body"><div class="alert-title-row"><strong>${escapeHtml(p.event||"Weather Alert")}</strong><span class="alert-priority">${escapeHtml(p.severity||"")} ${escapeHtml(p.urgency||"")}</span></div><span>${escapeHtml(p.headline||p.description||alertShortLabel(p))}</span><small>${escapeHtml(areas)} · ${escapeHtml(expires)}</small></div></a>`;
  }).join("");
}''')
# Radar: use official current NOAA MRMS MapServer through Esri Leaflet dynamic layer. Remove broken image animation machinery.
start=s.index('const NOAA_RADAR_IMAGE =')
end=s.index('\nfunction centerRadar', start)
new='''const NOAA_RADAR_MAPSERVER = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer";

async function loadRadar() {
  const status=$("#radarStatus"); if (!status || !state.map) return;
  status.textContent="Loading live NOAA radar…";
  try {
    if (!window.L?.esri?.dynamicMapLayer) throw new Error("NOAA map layer library failed to load.");
    if (state.radarImageOverlay) state.map.removeLayer(state.radarImageOverlay);
    state.radarImageOverlay = L.esri.dynamicMapLayer({url:NOAA_RADAR_MAPSERVER, opacity:0.82, useCors:true}).addTo(state.map);
    state.radarLoaded=true;
    status.textContent="Live NOAA MRMS radar • updates about every 5 minutes";
    $("#radarPlay") && ($("#radarPlay").style.display="none");
    $("#radarSlider") && ($("#radarSlider").closest(".radar-timeline").style.display="none");
  } catch(error) {
    status.textContent=`Radar unavailable: ${error.message}`;
  }
}

function toggleRadarPlayback() {}
function setRadarFrame() {}
'''
s=s[:start]+new+s[end:]
# prevent obsolete radar listeners causing errors (safe no-ops)
app.write_text(s)

# Update alerts filters in HTML
p=root/'alerts.html'; h=p.read_text()
old=re.search(r'<div aria-label="Weather alert filters".*?</div>',h)
new='<div aria-label="Weather alert categories" class="alert-filters" role="tablist"><button class="alert-filter active" data-alert-filter="all" type="button">ALL</button><button class="alert-filter" data-alert-filter="warning" type="button">WARNINGS</button><button class="alert-filter" data-alert-filter="watch" type="button">WATCHES</button><button class="alert-filter" data-alert-filter="advisory" type="button">ADVISORIES</button><button class="alert-filter" data-alert-filter="statement" type="button">STATEMENTS</button></div>'
h=h[:old.start()]+new+h[old.end():]
p.write_text(h)
# Add Esri Leaflet to radar page before app.js
p=root/'maps.html'; h=p.read_text()
h=h.replace('<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script><script src="app.js"></script>', '<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script><script src="https://cdn.jsdelivr.net/npm/esri-leaflet@3.0.15/dist/esri-leaflet.js" crossorigin=""></script><script src="app.js"></script>')
# simplify radar toolbar and timeline text
h=h.replace('<button id="radarPlay" type="button">PAUSE</button>','')
h=h.replace('<div class="radar-timeline">\n<input aria-label="Radar animation time" id="radarSlider" max="48" min="0" step="1" type="range" value="24"/>\n<div class="radar-time-labels"><span id="radarOldest">--</span><b id="radarFrameTime">Latest</b><span>NOW</span></div>\n</div>','')
p.write_text(h)
# Add statement styling and improve category tabs
css=root/'styles.css'; c=css.read_text(); c+='''\n.alert-filter[data-alert-filter="statement"]{border-color:#ffffff2b}.alert.statement{border-left-color:#9aa0aa}.alert-filters{display:flex;gap:8px;flex-wrap:wrap}.alert-filter{cursor:pointer}\n'''; css.write_text(c)
