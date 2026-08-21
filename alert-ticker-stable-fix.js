/* TRGTornado alert ticker stability layer */
(() => {
  function activeItems() {
    const now = Date.now();
    return (window.alertState?.national || []).filter(item => {
      const p = item?.properties || {};
      const status = String(p.status || "Actual").toLowerCase();
      const type = String(p.messageType || "Alert").toLowerCase();
      const expires = Date.parse(p.expires || p.ends || "");
      return (status === "actual" || status === "active" || !status) && type !== "cancel" && (!Number.isFinite(expires) || expires > now);
    });
  }

  async function stableRefresh() {
    if (typeof window.nwsAlerts !== "function" || !window.alertState) return;
    try {
      const data = await window.nwsAlerts(null);
      const features = Array.isArray(data?.features) ? data.features : [];
      window.alertState.national = features.filter(item => {
        const p=item?.properties||{};
        const eff=Date.parse(p.effective||p.onset||p.sent||"");
        const exp=Date.parse(p.expires||p.ends||"");
        return String(p.messageType||"Alert").toLowerCase() !== "cancel" && (!Number.isFinite(eff)||eff<=Date.now()) && (!Number.isFinite(exp)||exp>Date.now());
      });
      window.alertState.lastUpdated = new Date();
      window.alertState.lastSuccessMs = Date.now();
      if (typeof window.renderTicker === "function") window.renderTicker();
      if (typeof window.renderAlertCards === "function" && document.getElementById("alertsBox")) window.renderAlertCards();
      const u=document.getElementById("alertsUpdated");
      if(u)u.textContent=`Updated ${window.alertState.lastUpdated.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})} • live NWS feed`;
    } catch (e) {
      window.alertState.national=activeItems();
      if (typeof window.renderTicker === "function") window.renderTicker();
      const u=document.getElementById("alertsUpdated");
      if(u)u.textContent=window.alertState.national.length?"NWS refresh delayed • showing confirmed active alerts":"NWS alert feed temporarily unavailable • retrying";
      console.warn("TRGTornado ticker refresh preserved previous alerts",e);
    }
  }

  // app.js boot() uses this global before its own 60-second interval is made.
  window.loadNationalAlerts = stableRefresh;
  window.addEventListener("DOMContentLoaded", () => setTimeout(stableRefresh, 250));
})();
