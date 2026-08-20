# TRG Tornado Weather Site — v10

Static GitHub Pages weather dashboard for TRG Tornado.

## Included
- NWS current conditions, 7-day forecast and 24-hour hourly forecast for U.S. locations
- U.S. Census Geocoder for city/state/ZIP location search
- National NWS active alert ticker that scrolls across the site
- Weather Alerts center with automatic impact/urgency/certainty prioritization and filters
- Ongoing-alert filtering so expired, future and cancelled alerts are not displayed
- Automatic NWS alert refresh every 60 seconds
- Old alert data is cleared after 2 minutes without a successful NWS refresh
- Local alert count for the selected location, refreshed with the national feed
- NOAA/NWS MRMS radar animation
- Live SPC severe-weather outlook layers
- NHC Atlantic / East Pacific / Central Pacific outlooks
- YouTube Live embed support
- Responsive mobile layout

## GitHub Pages
Upload/replace `index.html`, `app.js`, `styles.css`, and `README.md` in the repository root and commit to `main`. GitHub Pages should redeploy automatically.

## Commercial-use design
This build avoids Open-Meteo and removes the OpenStreetMap Nominatim fallback. Forecasts and alerts use official U.S. government NWS/NOAA services, and U.S. location lookup uses the U.S. Census Geocoder. Government weather information is generally public domain, but TRG Tornado should retain source/attribution notices and comply with each service's current usage policies.

The interactive base map uses U.S. Geological Survey National Map tiles. The site also uses Leaflet from its public CDN. Review the current terms of any third-party service before adding new providers or paid/commercial feeds.

## Alerts
The alert center requests the NWS active-alert feed, filters to alerts that are actually ongoing at the time of display, and sorts them by event impact plus NWS severity, urgency and certainty. It refreshes every 60 seconds. If the NWS feed cannot be refreshed for more than two minutes, previously displayed alerts are removed rather than left on the site as potentially stale information.

## Radar
The live radar uses NOAA/NWS MRMS time-enabled base-reflectivity WMS data.

## YouTube Live
Open `app.js` and set `youtubeVideoId` to the ID from your YouTube URL.
