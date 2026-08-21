/* TRGTornado v67 clean repair layer
   This file intentionally runs AFTER app.js.
   It repairs the two places where app.js can race/overwrite the UI:
   - NWS ticker/alert state is kept alive through transient empty/error refreshes.
   - SPC maps are rebuilt from the site's original vector renderer, not a second image renderer.
*/
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const ongoing = item => {
    const p = item?.properties || {};
    const status = String(p.status || 'Actual').toLowerCase();
    const messageType = String(p.messageType || 'Alert').toLowerCase();
    const effective = Date.parse(p.effective || p.onset || p.sent || '');
    const expires = Date.parse(p.expires || p.ends || '');
    return (status === 'actual' || status === 'active') && messageType !== 'cancel' &&
      (!Number.isFinite(effective) || effective <= Date.now()) &&
      (!Number.isFinite(expires) || expires > Date.now());
  };

  const priority = event => {
    const e = String(event || '').toLowerCase();
    if (e.includes('tornado emergency')) return 140;
    if (e.includes('flash flood emergency')) return 135;
    if (e.includes('tornado warning')) return 130;
    if (e.includes('flash flood warning')) return 120;
    if (e.includes('severe thunderstorm warning') || e.includes('extreme wind warning')) return 115;
    if (e.includes('warning')) return 100;
    if (e.includes('tornado watch')) return 78;
    if (e.includes('severe thunderstorm watch')) return 74;
    if (e.includes('watch')) return 70;
    if (e.includes('statement')) return 35;
    return 50;
  };

  const sort = items => [...items].sort((a,b) => priority(b.properties?.event) - priority(a.properties?.event) ||
    (Date.parse(a.properties?.expires || '') || Infinity) - (Date.parse(b.properties?.expires || '') || Infinity));

  const tickerClass = event => {
    const e = String(event || '').toLowerCase();
    if (e.includes('tornado emergency') || e.includes('flash flood emergency')) return 'emergency';
    if (e.includes('tornado warning')) return 'tornado';
    if (e.includes('flash flood warning')) return 'flash';
    if (e.includes('severe thunderstorm warning') || e.includes('extreme wind warning')) return 'severe';
    if (e.includes('warning')) return 'warning';
    if (e.includes('watch')) return 'watch';
    if (e.includes('statement')) return 'statement';
    return 'advisory';
  };

  const area = p => String(p?.areaDesc || 'ACTIVE NWS AREA').split(';').map(x => x.trim()).filter(Boolean).slice(0,3).join(' • ');
  const remaining = expires => {
    const ms = Date.parse(expires || '') - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${Math.max(1,m)} MIN LEFT` : `${Math.floor(m/60)}H ${String(m%60).padStart(2,'0')}M LEFT`;
  };

  let lastGood = [];
  let alertRefreshBusy = false;

  function renderTicker(items, delayed = false) {
    const track = $('#alertTickerTrack');
    if (!track) return;
    const top = sort(items.filter(ongoing)).slice(0,12);
    if (!top.length) {
      track.innerHTML = `<span class="ticker-item ${delayed ? 'ticker-error' : 'ticker-clear'}"><span class="ticker-badge">${delayed ? 'NWS ALERTS' : 'ALL CLEAR'}</span> ${delayed ? 'Connecting to the live warning feed…' : 'No active NWS warnings or watches in the current feed.'}</span>`;
      track.style.removeProperty('--ticker-distance');
      return;
    }
    const build = list => list.map(item => {
      const p = item.properties || {};
      const cls = tickerClass(p.event);
      const left = remaining(p.expires);
      return `<button class="ticker-item ${cls}" type="button" data-alert-id="${esc(item.id || '')}"><span class="ticker-badge">${esc(p.event || 'WEATHER ALERT')}</span><span class="ticker-area">${esc(area(p))}</span>${left ? `<span class="ticker-time">${esc(left)}</span>` : ''}</button>`;
    }).join('<span class="ticker-separator">•</span>');
    track.innerHTML = build(top) + '<span class="ticker-separator ticker-loop-gap">•</span>' + build(top);
    requestAnimationFrame(() => track.style.setProperty('--ticker-distance', `${Math.max(track.scrollWidth / 2, 900)}px`));
    track.querySelectorAll('[data-alert-id]').forEach(btn => btn.addEventListener('click', () => {
      const item = top.find(x => String(x.id) === String(btn.dataset.alertId));
      const url = item?.properties?.web;
      if (url) window.open(url, '_blank', 'noopener'); else location.href = 'alerts.html';
    }));
  }

  async function refreshAlerts() {
    if (alertRefreshBusy) return;
    alertRefreshBusy = true;
    try {
      const r = await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg=${Date.now()}`, {
        cache: 'no-store',
        headers: {Accept:'application/geo+json,application/json'}
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      if (!Array.isArray(data.features)) throw new Error('Invalid NWS alert response');

      const incoming = data.features.filter(ongoing);
      // Do not interpret a transient empty response as an all-clear. Active
      // alerts naturally disappear from lastGood as their expiration passes.
      if (incoming.length) lastGood = incoming;
      const live = sort(lastGood.filter(ongoing));

      if (typeof alertState !== 'undefined') {
        alertState.national = live;
        alertState.lastSuccessMs = Date.now();
        alertState.lastUpdated = new Date();
      }
      renderTicker(live);
      if (typeof renderAlertCards === 'function' && $('#alertsBox')) renderAlertCards();
      const updated = $('#alertsUpdated');
      if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} • live NWS feed`;
    } catch (error) {
      const live = sort(lastGood.filter(ongoing));
      if (typeof alertState !== 'undefined') alertState.national = live;
      renderTicker(live, true);
      const updated = $('#alertsUpdated');
      if (updated) updated.textContent = live.length ? 'NWS refresh delayed • showing current active alerts' : 'NWS alert feed temporarily unavailable • retrying';
      console.warn('TRGTornado alert bridge refresh failed', error);
    } finally {
      alertRefreshBusy = false;
    }
  }

  function repairSpcMaps() {
    if (!$('[id="spcCatMap"]') || typeof L === 'undefined' || typeof SPC === 'undefined' || typeof loadSpcLayer !== 'function') return;

    const ids = [
      ['spcCatMap','spcCatStatus','categorical','SPC categorical outlook'],
      ['spcTornMap','spcTornStatus','tornado','tornado probability'],
      ['spcWindMap','spcWindStatus','wind','wind probability'],
      ['spcHailMap','spcHailStatus','hail','hail probability']
    ];

    // Destroy the renderer created by app.js before rebuilding. The old v66
    // patch only cleared innerHTML, which leaves Leaflet's internal map object
    // alive and is the source of the half-black/duplicate-control behavior.
    Object.keys(SPC.maps || {}).forEach(id => {
      try { SPC.maps[id]?.remove(); } catch {}
      delete SPC.maps[id];
    });

    ids.forEach(([mapId,statusId,key,label]) => {
      const box = document.getElementById(mapId);
      if (!box) return;
      box.innerHTML = '';
      box.style.height = mapId === 'spcCatMap' ? '430px' : '300px';
      box.style.minHeight = box.style.height;
    });

    Promise.all(ids.map(([mapId,statusId,key,label]) => loadSpcLayer(key,mapId,statusId,label).catch(err => console.warn('SPC rebuild failed',key,err))))
      .then(() => {
        Object.values(SPC.maps || {}).forEach(map => {
          try {
            if (map.zoomControl) map.zoomControl.remove();
            const control = L.control({position:'topright'});
            control.onAdd = () => {
              const wrap = L.DomUtil.create('div','trg-spc-zoom');
              wrap.innerHTML = '<button type="button" title="Zoom in" aria-label="Zoom in">+</button><button type="button" title="Zoom out" aria-label="Zoom out">−</button><button type="button" title="Reset map" aria-label="Reset map">⌂</button>';
              const buttons = wrap.querySelectorAll('button');
              L.DomEvent.disableClickPropagation(wrap);
              L.DomEvent.on(buttons[0],'click',e => { L.DomEvent.stop(e); map.zoomIn(); });
              L.DomEvent.on(buttons[1],'click',e => { L.DomEvent.stop(e); map.zoomOut(); });
              L.DomEvent.on(buttons[2],'click',e => { L.DomEvent.stop(e); map.setView([38,-96],4); });
              return wrap;
            };
            control.addTo(map);
            requestAnimationFrame(() => map.invalidateSize(false));
            setTimeout(() => map.invalidateSize(false),350);
          } catch (err) { console.warn('SPC control repair failed',err); }
        });
      });
  }

  const style = document.createElement('style');
  style.textContent = `
    .spc-map,.spc-product-map{position:relative!important;overflow:hidden!important;background:#0b0e15!important}
    .spc-map{height:430px!important;min-height:430px!important}
    .spc-product-map{height:300px!important;min-height:300px!important}
    .spc-map .leaflet-container,.spc-product-map .leaflet-container{width:100%!important;height:100%!important;background:#0b0e15!important}
    .trg-spc-zoom{display:flex;flex-direction:column;gap:3px;margin:8px}
    .trg-spc-zoom button{width:32px;height:30px;padding:0;border:1px solid #ff303055;border-radius:5px;background:#0b0e15;color:#fff;font-size:16px;font-weight:1000;line-height:1;cursor:pointer;box-shadow:0 2px 8px #0008}
    .trg-spc-zoom button:hover{background:#ff3030;color:#05050a}
    .ticker-item.tornado .ticker-badge,.ticker-item.emergency .ticker-badge{color:#ff3030!important}
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

  document.addEventListener('DOMContentLoaded', () => {
    // app.js has already registered its startup handler. Wait for it to finish,
    // then repair the actual DOM/maps it created.
    setTimeout(() => {
      refreshAlerts();
      if ($('#spcCatMap')) repairSpcMaps();
    }, 500);

    setInterval(refreshAlerts, 60000);
    if ($('#spcCatMap')) setInterval(repairSpcMaps, 300000);
    window.addEventListener('resize', () => {
      Object.values(typeof SPC !== 'undefined' ? SPC.maps : {}).forEach(map => {
        try { map.invalidateSize(false); } catch {}
      });
    });
  });
})();
