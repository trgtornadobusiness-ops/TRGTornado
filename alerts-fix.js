/* TRG Tornado alert-center patch: use the NWS active feed as the source of truth, keep every active alert, and paginate the UI. */
(() => {
  const box = document.getElementById("alertsBox");
  if (!box) return;

  const state = { all: [], filter: "all", page: 1, perPage: 20 };
  let timer = null;

  const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const active = p => {
    const status = String(p?.status || "Actual").toLowerCase();
    const type = String(p?.messageType || "Alert").toLowerCase();
    if (status && !["actual", "active"].includes(status)) return false;
    if (type === "cancel") return false;
    const effective = Date.parse(p?.effective || p?.onset || p?.sent || "");
    const expires = Date.parse(p?.expires || p?.ends || "");
    return (!Number.isFinite(effective) || effective <= Date.now()) && (!Number.isFinite(expires) || expires > Date.now());
  };
  const typeOf = event => {
    const e = String(event || "").toLowerCase();
    if (e.includes("warning") || e.includes("emergency")) return "warning";
    if (e.includes("watch")) return "watch";
    return "other";
  };
  const score = event => {
    const e = String(event || "").toLowerCase();
    if (e.includes("tornado emergency")) return 1000;
    if (e.includes("tornado warning")) return 950;
    if (e.includes("severe thunderstorm warning")) return 900;
    if (e.includes("extreme wind warning")) return 890;
    if (e.includes("flash flood emergency")) return 880;
    if (e.includes("flash flood warning")) return 850;
    if (e.includes("tornado watch")) return 700;
    if (e.includes("severe thunderstorm watch")) return 680;
    if (e.includes("watch")) return 600;
    if (e.includes("warning")) return 500;
    return 100;
  };
  const sort = a => [...a].sort((x,y) => score(y.properties?.event) - score(x.properties?.event) || Date.parse(x.properties?.expires || 0) - Date.parse(y.properties?.expires || 0));
  const isSevere = p => /tornado warning|severe thunderstorm warning|extreme wind warning/i.test(p?.event || "");
  const isSevereTstorm = p => /severe thunderstorm warning/i.test(p?.event || "");
  const isTornado = p => /tornado warning|tornado emergency/i.test(p?.event || "");

  function ensurePager() {
    let pager = document.getElementById("trgAlertPager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "trgAlertPager";
      pager.className = "trg-alert-pager";
      box.insertAdjacentElement("afterend", pager);
    }
    return pager;
  }

  function render() {
    const filtered = sort(state.all.filter(item => state.filter === "all" || typeOf(item.properties?.event) === state.filter));
    const pages = Math.max(1, Math.ceil(filtered.length / state.perPage));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.perPage;
    const visible = filtered.slice(start, start + state.perPage);

    box.innerHTML = visible.length ? visible.map((item, i) => {
      const p = item.properties || {};
      const event = p.event || "Weather Alert";
      const type = typeOf(event);
      const cls = /tornado/i.test(event) ? "tornado" : /severe thunderstorm/i.test(event) ? "severe" : type === "watch" ? "watch" : /flash flood/i.test(event) ? "alert-flash-flood" : "warning";
      const issued = p.sent || p.effective || p.onset;
      const expires = p.expires || p.ends;
      const areas = String(p.areaDesc || "Active NWS area").split(";").map(x => x.trim()).filter(Boolean).slice(0,3).join(" • ");
      const href = /^https:\/\//i.test(p.web || "") ? p.web : "https://www.weather.gov/alerts";
      const rank = start + i + 1;
      const icon = type === "watch" ? "W" : "!";
      const considerable = /considerable/i.test(p.headline || "") || /considerable/i.test(p.description || "");
      return `<a class="alert ${cls} ${considerable ? "alert-considerable" : ""}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><div class="alert-rank">${rank}</div><div class="alert-icon">${icon}</div><div class="alert-body"><div class="alert-title-row"><strong>${esc(event)}</strong><span class="alert-priority">${esc(p.severity || "Unknown")} • ${esc(p.urgency || "Unknown")}</span></div><span>${esc(p.headline || event)}</span><small>${esc(areas)}${issued ? ` · Issued ${esc(new Date(issued).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}))}` : ""}${expires ? ` · Expires ${esc(new Date(expires).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}))}` : ""}</small></div></a>`;
    }).join("") : `<div class="empty"><strong>No active alerts found.</strong><br><small>The NWS active feed currently has nothing matching this filter.</small></div>`;

    const pager = ensurePager();
    pager.innerHTML = pages > 1 ? `<button type="button" data-page="prev" ${state.page === 1 ? "disabled" : ""}>← PREVIOUS</button><span>PAGE ${state.page} OF ${pages} • ${filtered.length} ALERTS</span><button type="button" data-page="next" ${state.page === pages ? "disabled" : ""}>NEXT →</button>` : `<span>${filtered.length} ACTIVE ALERT${filtered.length === 1 ? "" : "S"} • ALL ALERTS SHOWN</span>`;
    pager.querySelector('[data-page="prev"]')?.addEventListener("click", () => { state.page--; render(); window.scrollTo({top: box.getBoundingClientRect().top + window.scrollY - 100, behavior:"smooth"}); });
    pager.querySelector('[data-page="next"]')?.addEventListener("click", () => { state.page++; render(); window.scrollTo({top: box.getBoundingClientRect().top + window.scrollY - 100, behavior:"smooth"}); });

    const total = state.all.length;
    const severeTstorms = state.all.filter(x => isSevereTstorm(x.properties)).length;
    const severe = state.all.filter(x => isSevere(x.properties)).length;
    const tornado = state.all.filter(x => isTornado(x.properties)).length;
    const count = document.getElementById("alertCount");
    if (count) count.textContent = severeTstorms;
    const countLabel = count?.parentElement?.querySelector("span");
    if (countLabel) countLabel.textContent = "severe thunderstorm warnings ongoing";
    const local = document.getElementById("localAlertCount");
    if (local) local.textContent = total;
    const localLabel = local?.parentElement?.querySelector("span");
    if (localLabel) localLabel.textContent = `all active alerts • ${severe} severe warnings • ${tornado} tornado`;
    const tag = document.getElementById("alertTag");
    if (tag) { tag.textContent = `${total} ACTIVE`; tag.className = "tag red"; }
  }

  async function refresh() {
    try {
      const url = `https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`;
      const response = await fetch(url, {cache:"no-store", headers:{Accept:"application/geo+json,application/json"}});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features.filter(x => active(x.properties)).map(x => ({id:x.id, properties:x.properties || {}, geometry:x.geometry || null})) : [];
      const dedup = new Map();
      features.forEach(x => dedup.set(String(x.id || `${x.properties.event}|${x.properties.areaDesc}|${x.properties.expires}`), x));
      state.all = [...dedup.values()];
      state.page = 1;
      render();
      const updated = document.getElementById("alertsUpdated");
      if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} • direct NWS active feed`;
      const ticker = document.getElementById("alertTickerTrack");
      if (ticker && window.alertState) { window.alertState.national = state.all; if (typeof window.renderTicker === "function") window.renderTicker(); }
    } catch (error) {
      console.warn("TRG direct NWS alert feed failed", error);
      const updated = document.getElementById("alertsUpdated");
      if (updated) updated.textContent = "Direct NWS feed unavailable • retrying";
    }
  }

  document.querySelectorAll(".alert-filter").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".alert-filter").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.alertFilter || "all";
    state.page = 1;
    render();
  }));

  const refreshButton = document.getElementById("alertsRefresh");
  refreshButton?.addEventListener("click", refresh);
  refresh();
  timer = setInterval(refresh, 60000);
  window.addEventListener("beforeunload", () => clearInterval(timer), {once:true});
})();
