# TRG Tornado Weather Site v37

Patch release: alerts now have a GitHub Actions server-side fallback that fetches the official NWS active-alert feed every 5 minutes with a proper User-Agent, avoiding browser-only request/CORS limitations. Tropical graphics are fitted inside the viewer without forced full-height scaling. Navigation places SOCIAL before LIVE, with LIVE last.

After uploading, enable GitHub Actions if prompted and run **Update NWS Alerts** once manually. The scheduled job then refreshes alerts every 5 minutes.
