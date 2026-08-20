# TRG Tornado Weather Site — v3

A static GitHub Pages weather dashboard for TRG Tornado.

## Included
- Location search and current conditions
- 7-day forecast
- Next 24 hours
- Active NWS alerts for the selected point
- SPC Day 1 categorical, tornado, wind and hail graphics
- NHC Atlantic / Eastern Pacific / Central Pacific tropical outlooks
- Interactive radar using Leaflet + RainViewer
- National map-room shortcuts
- YouTube Live embed slot
- Responsive mobile layout
- TRG Tornado branding

## Publish on GitHub Pages
Upload/replace these four files in the repository root:
- `index.html`
- `app.js`
- `styles.css`
- `README.md`

Keep GitHub Pages set to:
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

## YouTube Live
Open `app.js` and set:

`youtubeVideoId: "YOUR_VIDEO_ID"`

For a live stream, use the YouTube video/live broadcast ID.

## Data sources
- NWS API: official forecasts/alerts
- NOAA/SPC: severe-weather outlook graphics
- NOAA/NHC: tropical outlook graphics
- Open-Meteo: location search and forecast data
- RainViewer: radar tiles
- OpenStreetMap: base map

RainViewer's public API is intended for personal/educational/small community use and requires visible attribution. Review its current terms before relying on it for high-volume or commercial traffic.

## Important
This dashboard is informational. For life-safety decisions, follow official NWS warnings and local emergency management guidance.

## Customization
TRG analysis headlines are intentionally editable in `index.html`.
