# TRG Tornado Weather Site — v12

Multi-page GitHub Pages weather dashboard for TRG Tornado.

## Pages
- `index.html` — home hub
- `forecast.html` — current conditions, 7-day and hourly forecast
- `alerts.html` — live NWS active alerts, prioritized and filtered
- `severe.html` — live SPC outlook maps
- `tropical.html` — NHC Atlantic/East Pacific/Central Pacific outlooks
- `maps.html` — NOAA MRMS radar and national products
- `live.html` — YouTube live coverage

## Live data
- NWS API for forecasts and alerts
- NOAA/NWS MRMS radar WMS for radar imagery
- NOAA/SPC ArcGIS services for severe-weather outlooks
- NHC official graphics for tropical outlooks

The NWS API is open data and free to use. NOAA radar data is public government data. Third-party map libraries/services may have their own attribution/usage requirements.

## GitHub Pages
Upload the contents of this folder to the repository root, replacing the old `index.html`, `app.js`, `styles.css`, and adding the new page files. Keep the site source set to `main` / root.


## v12 updates
- Scroll-wheel zoom and pan enabled on SPC severe-weather maps.
- Tropical outlook graphics now support scroll-wheel zoom and drag-to-pan.
- Added Atlantic, Eastern Pacific, Central Pacific, and JTWC Western Pacific tabs.
- Tropical graphics use cache-busting timestamps so the latest official image is requested.


## IMPORTANT — GitHub Pages upload

Upload the files in this folder to the **root** of your GitHub repository. Do not upload the ZIP itself and do not leave them inside a `TRG-Tornado-Weather-Site-v13/` subfolder. The root of the repository should contain `index.html`, `app.js`, `styles.css`, and the page HTML files directly.


## v15 source patch
Active alerts now use the official NOAA/NWS Watch, Warning and Advisory ArcGIS service for browser compatibility on GitHub Pages. Tropical outlooks use the current NHC production archive host with an official NHC archive fallback and cache-busting.


## v16
Broadcast-style live NWS alert ticker with priority ordering, affected areas, time remaining, NEW indicator, continuous scrolling, and one-minute refresh. Uses the official NWS Alerts API first with NOAA/NWS ArcGIS WWA fallback.


## v18 fixes
- ZIP-code forecast search support
- Radar navigation renamed to Radar
- NOAA MRMS radar switched to ArcGIS ImageServer export-image rendering
- Current NWS warning layer 0 added so Severe Thunderstorm and Tornado Warnings are not omitted


## v19 fixes
- ZIP-only forecast searches use Zippopotam.us for ZIP-to-centroid lookup, with Census Geocoder retained for city/state searches.
- Weather alerts query the official NOAA/NWS CurrentWarnings layer and WatchesWarnings layer using GeoJSON and correct hazard fields, with NWS active alerts as fallback.
- ZIP lookup attribution: Zippopotam.us / GeoNames data, available under the Open Database License.


## v21 updates
- Radar uses the official NOAA/NWS MRMS current reflectivity MapServer through Esri Leaflet instead of the previous time-enabled image overlay.
- Weather Alerts use the official NWS /alerts/active feed and are separated into All, Warnings, Watches, Advisories, and Statements.
- ZIP lookup uses postal-code geocoding with a browser-friendly fallback.

## v21 reliability patch
- NWS forecast parsing corrected for Fahrenheit-native NWS values.
- National alert center uses official NOAA/NWS WWA GIS layers first, with NWS active API retained for point-specific alerts.
- Tropical graphics use the current NHC `two_*_7d0.png` products from the latest archive paths.
- ZIP geocoding remains on the working dedicated ZIP lookup path.


## v24 fixes
- NOAA MRMS radar now uses MapServer exportImage overlays instead of WMS tiles.
- SPC Day 1 queries are cache-busted so the latest probabilistic tornado outlook is requested.
- NHC Atlantic/Eastern Pacific/Central Pacific graphics use current xgtwo 7-day filenames with fallbacks.
- NOAA/NWS WWA alert layers are the primary alert source, with NWS active alerts as fallback.


## v24 auto-update patch
SPC Day 1 layers refresh every 5 minutes. NHC/JTWC tropical graphics refresh every 10 minutes with cache-busting. Alert queries are hardened against stale/cached responses and use official NOAA/NWS WWA layers first with NWS active-alert fallback.
