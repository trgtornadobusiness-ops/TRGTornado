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
