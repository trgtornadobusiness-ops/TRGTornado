# TRG Tornado Weather Site — v2

Open `index.html` or serve the folder with a static web server.

## What is live
- Location search + 5-day forecast through Open-Meteo.
- Current conditions, temperature, humidity and wind.
- Active NWS alerts for the selected point.
- SPC/NHC graphic slots.
- Severe, tropical, map-room and YouTube Live sections.
- Responsive mobile layout.

Open-Meteo documents its forecast and geocoding APIs here:
https://open-meteo.com/en/docs
https://open-meteo.com/en/docs/geocoding-api

The NWS API provides active alerts through `api.weather.gov/alerts/active`.
For a production site, keep an official NWS warning disclaimer and verify the
current NWS data before presenting it as a life-safety source.

## Before publishing
- Put your real YouTube channel/video ID into the live section.
- Replace/edit the sample severe/tropical headline text with your actual forecast.
- Confirm the remote SPC/NHC image URLs you want to use.
- Add your logo/favicon.
- Add an interactive radar provider or your preferred map embed.
