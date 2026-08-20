# TRG Tornado Weather Site v38

Upload the website files to the repository root. The `.github/workflows/update-alerts.yml` file is required for automatic NWS alert updates. If your GitHub upload method does not show or upload hidden `.github` folders, create `.github/workflows` in GitHub and upload `update-alerts.yml` there. GitHub only discovers Actions workflow YAML files from `.github/workflows`.

After the first upload, open **Actions → Update NWS Alerts → Run workflow** once. The workflow then refreshes `alerts.json` every 5 minutes. GitHub documents that workflows are defined in `.github/workflows`.

Site version: 38


## Version 40 alert deployment note
The NWS alert workflow now commits alerts.json only when alert data changes. This prevents a five-minute timestamp-only commit from constantly retriggering GitHub Pages deployments.


Version 41 alert patch: the site now prioritizes the GitHub Actions-generated alerts.json snapshot, with live NWS/NOAA feeds retained as fallbacks.
