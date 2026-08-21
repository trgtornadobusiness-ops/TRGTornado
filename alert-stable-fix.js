/* TRGTornado persistent alert/ticker repair.
   Keeps the last valid active-alert set through temporary NWS outages and
   applies the same alert color classes used by the Weather Alerts cards. */
(() => {
  let lastGood = [];
  let busy = false;

  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const active = item => {
    const p = item?.properties || {};
    const status = String(p.status || 'Actual').toLowerCase();
    const type = String(p.messageType || 'Alert').toLowerCase();
    const exp = Date.parse(p.expires || p.ends || '');
    const eff = Date.parse(p.effective || p.onset || p.sent || '');
    return (status === 'actual' || status === 'active') && type !== 'cancel' &&
      (!Number.isFinite(eff) || eff <= Date.now()) && (!Number.isFinite(exp) || exp > Date.now());
  };
  const rank = e => {
    const x = String(e || '').toLowerCase();
    if (x.includes('tornado emergency')) return 140;
    if (x.includes('flash flood emergency')) return 135;
    if (x.includes('tornado warning')) return 130;
    if (x.includes('hurricane warning') || x.includes('storm surge warning')) return 125;
    if (x.includes('flash flood warning')) return 120;
    if (x.includes('severe thunderstorm warning') || x.includes('extreme wind warning')) return 115;
    if (x.includes('warning')) return 100;
    if (x.includes('tornado watch')) return 78;
    if (x.includes('hurricane watch') || x.includes('storm surge watch')) return 76;
    if (x.includes('severe thunderstorm watch')) return 74;
    if (x.includes('watch')) return 70;
    if (x.includes('statement')) return 35;
    return 50;
  };
  const cls = e => {
    const x = String(e || '').toLowerCase();
    if (x.includes('tornado emergency') || x.includes('flash flood emergency')) return 'emergency';
    if (x.includes('tornado warning')) return 'tornado';
    if (x.includes('flash flood warning')) return 'flash';
    if (x.includes('severe thunderstorm warning') || x.includes('extreme wind warning')) return 'severe';
    if (x.includes('warning')) return 'warning';
    if (x.includes('watch')) return 'watch';
    if (x.includes('statement')) return 'statement';
    return 'advisory';
  };
  const area = p => String(p.areaDesc || 'ACTIVE NWS AREA').split(';').map(x => x.trim()).filter(Boolean).slice(0,3).join(' • ');
  const left = d => { const ms = Date.parse(d || '') - Date.now(); if (!Number.isFinite(ms) || ms <= 0) return ''; const m = Math.floor(ms/60000); return m < 60 ? `${Math.max(1,m)} MIN LEFT` : `${Math.floor(m/60)}H ${String(m%60).padStart(2,'0')}M LEFT`; };

  function render(items, offline=false) {
    const track = $('#alertTickerTrack');
    if (!track) return;
    const top = items.filter(active).sort((a,b) => rank(b.properties?.event) - rank(a.properties?.event)).slice(0,12);
    if (!top.length) {
      track.innerHTML = `<span class="ticker-item ${offline ? 'ticker-error' : 'ticker-clear'}"><span class="ticker-badge">${offline ? 'NWS ALERTS' : 'ALL CLEAR'}</span> ${offline ? 'Live feed temporarily unavailable — keeping watch for updates.' : 'No active NWS warnings or watches in the current feed.'}</span>`;
      return;
    }
    const build = list => list.map(item => {
      const p=item.properties||{}, c=cls(p.event), t=left(p.expires);
      return `<button class="ticker-item ${c}" type="button" data-alert-id="${esc(item.id||'')}"><span class="ticker-badge">${esc(p.event||'WEATHER ALERT')}</span><span class="ticker-area">${esc(area(p))}</span>${t ? `<span class="ticker-time">${esc(t)}</span>` : ''}</button>`;
    }).join('<span class="ticker-separator">•</span>');
    track.innerHTML = build(top) + '<span class="ticker-separator ticker-loop-gap">•</span>' + build(top);
    requestAnimationFrame(() => track.style.setProperty('--ticker-distance', `${Math.max(track.scrollWidth/2,900)}px`));
    track.querySelectorAll('[data-alert-id]').forEach(btn => btn.addEventListener('click', () => {
      const target = top.find(x => String(x.id) === String(btn.dataset.alertId));
      if (target?.properties?.web) window.open(target.properties.web, '_blank', 'noopener');
      else window.location.href='alerts.html';
    }));
  }

  async function refresh() {
    if (busy) return;
    busy=true;
    try {
      const r = await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`, {cache:'no-store', headers:{Accept:'application/geo+json,application/json'}});
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      if (!Array.isArray(data.features)) throw new Error('Invalid NWS response');
      const incoming = data.features.filter(active);
      // A successful empty response is a valid all-clear. A failed response is not.
      lastGood = incoming;
      if (typeof alertState !== 'undefined') {
        alertState.national = incoming;
        alertState.lastSuccessMs = Date.now();
        alertState.lastUpdated = new Date();
      }
      render(lastGood);
    } catch (e) {
      const live = lastGood.filter(active);
      if (typeof alertState !== 'undefined') alertState.national = live;
      render(live, true);
      console.warn('TRGTornado persistent alert feed retry', e);
    } finally { busy=false; }
  }

  const style=document.createElement('style');
  style.textContent=`
    .ticker-item.emergency .ticker-badge,.ticker-item.tornado .ticker-badge{color:#ff3030!important}
    .ticker-item.severe .ticker-badge,.ticker-item.warning .ticker-badge{color:#ff7a00!important}
    .ticker-item.flash .ticker-badge{color:#22c55e!important}
    .ticker-item.watch .ticker-badge{color:#ffd52e!important}
    .ticker-item.statement .ticker-badge{color:#a78bfa!important}
    .ticker-item.advisory .ticker-badge{color:#60a5fa!important}
    .ticker-item.emergency,.ticker-item.tornado{border-color:#ff303044!important}
    .ticker-item.severe,.ticker-item.warning{border-color:#ff7a0044!important}
    .ticker-item.flash{border-color:#22c55e44!important}
    .ticker-item.watch{border-color:#ffd52e44!important}
    .ticker-item.statement{border-color:#a78bfa44!important}
    .ticker-item.advisory{border-color:#60a5fa44!important}
  `;
  document.head.appendChild(style);
  window.addEventListener('DOMContentLoaded', () => { setTimeout(refresh, 700); setInterval(refresh, 60000); });
})();
