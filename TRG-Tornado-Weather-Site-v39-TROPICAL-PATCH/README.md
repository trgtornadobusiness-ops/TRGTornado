# TRG Tornado Weather Site v38

Upload the website files to the repository root. The `.github/workflows/update-alerts.yml` file is required for automatic NWS alert updates. If your GitHub upload method does not show or upload hidden `.github` folders, create `.github/workflows` in GitHub and upload `update-alerts.yml` there. GitHub only discovers Actions workflow YAML files from `.github/workflows`.

After the first upload, open **Actions → Update NWS Alerts → Run workflow** once. The workflow then refreshes `alerts.json` every 5 minutes. GitHub documents that workflows are defined in `.github/workflows`.

Site version: 38
