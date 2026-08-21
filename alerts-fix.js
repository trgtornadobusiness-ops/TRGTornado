/* Complete active NWS alert center: targeted alerts, correct priority, accurate counts, and Statements/Advisories tabs. */
(() => {
  const box = document.getElementById("alertsBox");
  if (!box) return;
  const state = { all: [], filter: "all", page: 1, perPage: 20 };
  const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const active = p => {
    const status = String(p?.status || "Actual").toLowerCase();
    const type = String(p?.messageType || "Alert").toLowerCase();
    if (status && !["actual", "active"].includes(status)) return false;
    if (type === "cancel") return false;
    const expires = Date.parse(p?.expires || p?.ends || "");
    return !Number.isFinite(expires) || expires > Date.now();
  };
  const eventKind = event => {
    const e = String(event || "").toLowerCase().trim();
    if (e.includes("tornado emergency") || e === "tornado warning") return "tornado";
    if (e === "severe thunderstorm warning" || e === "extreme wind warning") return "severe";
    if (e === "flash flood warning" || e === "flash flood emergency") return "flash";
    if (e === "tornado watch" || e === "severe thunderstorm watch") return "watch";
    if (e.includes("advisory")) return "advisory";
    if (e.includes("statement")) return "statement";
    return "other";
  };
  const priority = {tornado:1000,severe:900,flash:800,watch:700,advisory:600,statement:500,other:-1};
  const isTarget = p => eventKind(p?.event) !== "other";
  const sort = a => [...a].sort((x,y) => priority[eventKind(y.properties?.event)] - priority[eventKind(x.properties?.event)] || Date.parse(x.properties?.sent || x.properties?.effective || 0) - Date.parse(y.properties?.sent || y.properties?.effective || 0));
  const isSevereWarning = p => ["tornado","severe"].includes(eventKind(p?.event));
  const isSevereTstorm = p => eventKind(p?.event) === "severe";
  const isTornado = p => eventKind(p?.event) === "tornado';

  function pager() {
    let el = document.getElementById("trgAlertPager");
    if (!el) { el = document.createElement("div"); el.id = "trgAlertPager"; el.className = "trg-alert-pager"; box.insertAdjacentElement("afterend", el); }
    return el;
  }
  function render() {
    const filtered = sort(state.all.filter(x => {
      const kind = eventKind(x.properties?.event);
      if (state.filter === "all") return true;
      if (state.filter === "warning") return ["tornado","severe","flash"].includes(kind);
      if (state.filter === "watch") return kind === "watch";
      if (state.filter === "statement") return kind === "statement";
      if (state.filter === "advisory") return kind === "advisory";
      return false;
    }));
    const pages = Math.max(1, Math.ceil(filtered.length / state.perPage));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.perPage;
    const visible = filtered.slice(start, start + state.perPage);
    box.innerHTML = visible.length ? visible.map((item, i) => {
      const p = item.properties || {}, event = p.event || "Weather Alert", kind = eventKind(event);
      const cls = kind === "tornado" ? "tornado" : kind === "severe" ? "severe" : kind === "flash" ? "alert-flash-flood" : kind === "watch" ? "watch" : kind === "advisory" ? "alert-advisory" : "alert-statement";
      const issued = p.sent || p.effective || p.onset, expires = p.expires || p.ends;
      const areas = String(p.areaDesc || "Active NWS area").split(";").map(x => x.trim()).filter(Boolean).slice(0,3).join(" • ");
      const href = /^https:\/\//i.test(p.web || "") ? p.web : "https://www.weather.gov/alerts";
      const considerable = kind === "severe" && /considerable/i.test(`${p.headline || ""} ${p.description || ""}`);
      const icon = kind === "watch" ? "W" : kind === "advisory" ? "A" : kind === "statement" ? "S" : "!";
      return `<a class="alert ${cls} ${considerable ? "alert-considerable" : ""}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><div class="alert-rank">${start+i+1}</div><div class="alert-icon">${icon}</div><div class="alert-body"><div class="alert-title-row"><strong>${esc(event)}</strong><span class="alert-priority">${esc(p.severity || "Unknown")} • ${esc(p.urgency || "Unknown")}</span></div><span>${esc(p.headline || event)}</span><small>${esc(areas)}${issued ? ` · Issued ${esc(new Date(issued).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}))}` : ""}${expires ? ` · Expires ${esc(new Date(expires).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}))}` : ""}</small></div></a>`;
    }).join("") : `<div class="empty"><strong>No active alerts found.</strong><br><small>The NWS active feed currently has nothing matching this filter.</small></div>`;
    const p = pager();
    p.innerHTML = pages > 1 ? `<button type="button" data-page="prev" ${state.page===1?"disabled":""}>← PREVIOUS</button><span>PAGE ${state.page} OF ${pages} • ${filtered.length} ALERTS</span><button type="button" data-page="next" ${state.page===pages?"disabled":""}>NEXT →</button>` : `<span>${filtered.length} ACTIVE ALERT${filtered.length===1?"":"S"} • ALL ALERTS SHOWN</span>`;
    p.querySelector('[data-page="prev"]')?.addEventListener("click", () => { state.page--; render(); });
    p.querySelector('[data-page="next"]')?.addEventListener("click", () => { state.page++; render(); });
    const total = state.all.length, severe = state.all.filter(x => isSevereWarning(x.properties)).length, storms = state.all.filter(x => isSevereTstorm(x.properties)).length, tornado = state.all.filter(x => isTornado(x.properties)).length;
    const count = document.getElementById("alertCount"), totalEl = document.getElementById("localAlertCount"), tag = document.getElementById("alertTag");
    if (count) count.textContent = storms;
    if (count?.parentElement?.querySelector("span")) count.parentElement.querySelector("span").textContent = "severe thunderstorm warnings ongoing";
    if (totalEl) totalEl.textContent = total;
    if (totalEl?.parentElement?.querySelector("span")) totalEl.parentElement.querySelector("span").textContent = `target alerts • ${severe} severe warnings • ${tornado} tornado`;
    if (tag) { tag.textContent = `${total} ACTIVE`; tag.className = "tag red"; }
  }
  async function refresh() {
    try {
      const response = await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`, {cache:"no-store", headers:{Accept:"application/geo+json,application/json"}});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features.filter(x => active(x.properties) && isTarget(x.properties)).map(x => ({id:x.id, properties:x.properties || {}, geometry:x.geometry || null})) : [];
      const dedup = new Map(); features.forEach(x => dedup.set(String(x.id || `${x.properties.event}|${x.properties.areaDesc}|${x.properties.expires}`), x));
      state.all = [...dedup.values()]; state.page = 1; render();
      const updated = document.getElementById("alertsUpdated");
      if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} • direct NWS active feed`;
    } catch (error) {
      console.warn("TRG direct NWS alert feed failed", error);
      const updated = document.getElementById("alertsUpdated"); if (updated) updated.textContent = "Direct NWS feed unavailable • retrying";
    }
  }
  document.querySelectorAll(".alert-filter").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".alert-filter").forEach(x => x.classList.remove("active")); btn.classList.add("active"); state.filter = btn.dataset.alertFilter || "all"; state.page = 1; render(); }));
  document.getElementById("alertsRefresh")?.addEventListener("click", refresh);
  refresh(); setInterval(refresh, 60000);
})();
