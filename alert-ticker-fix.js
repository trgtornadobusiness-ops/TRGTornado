/* TRG alert ticker patch
   Uses the same target products, ordering, and colors as the Weather Alerts page.
   Generic Flood Warnings are intentionally excluded. */
(() => {
  const track = document.getElementById('alertTickerTrack');
  if (!track) return;

  const EVENTS = new Set([
    'Tornado Warning','Tornado Emergency',
    'Severe Thunderstorm Warning','Extreme Wind Warning',
    'Flash Flood Warning','Flash Flood Emergency',
    'Tornado Watch','Severe Thunderstorm Watch',
    'Special Weather Statement','Severe Weather Statement'
  ]);
  const rank = {tornado:1000,severe:900,flash:800,watch:700,statement:600,advisory:500};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kind = event => {
    const e = String(event || '').toLowerCase();
    if (e.includes('tornado emergency') || e.includes('tornado warning')) return 'tornado';
    if (e.includes('severe thunderstorm warning') || e.includes('extreme wind warning')) return 'severe';
    if (e.includes('flash flood warning') || e.includes('flash flood emergency')) return 'flash';
    if (e.includes('watch')) return 'watch';
    if (e.includes('statement')) return 'statement';
    return 'advisory';
  };
  const color = {tornado:'#ef4444',severe:'#f97316',flash:'#22c55e',watch:'#ffd52e',statement:'#a78bfa',advisory:'#60a5fa'};
  const label = {tornado:'TORNADO',severe:'SEVERE',flash:'FLASH FLOOD',watch:'WATCH',statement:'STATEMENT',advisory:'ADVISORY'};
  const icon = {tornado:'!',severe:'!',flash:'!',watch:'W',statement:'S',advisory:'A'};
  const ongoing = p => {
    const status = String(p?.status || 'Actual').toLowerCase();
    const messageType = String(p?.messageType || 'Alert').toLowerCase();
    const effective = Date.parse(p?.effective || p?.onset || p?.sent || '');
    const expires = Date.parse(p?.expires || p?.ends || '');
    return (status === 'actual' || status === 'active') && messageType !== 'cancel' &&
      (!Number.isFinite(effective) || effective <= Date.now()) &&
      (!Number.isFinite(expires) || expires > Date.now());
  };

  function render(features) {
    const items = features.filter(f => EVENTS.has(String(f?.properties?.event || '').trim()) && ongoing(f.properties));
    items.sort((a,b) => rank[kind(b.properties?.event)] - rank[kind(a.properties?.event)] ||
      Date.parse(a.properties?.expires || '') - Date.parse(b.properties?.expires || ''));

    if (!items.length) {
      track.innerHTML = '<span class="ticker-item ticker-loading">No target warnings, watches, statements or advisories active</span>';
      return;
    }

    track.innerHTML = items.map(f => {
      const p = f.properties || {};
      const k = kind(p.event);
      const considerable = k === 'severe' && /considerable/i.test(`${p.headline || ''} ${p.description || ''} ${p.instruction || ''}`);
      const c = color[k];
      const text = p.headline || p.event || 'Weather Alert';
      const area = String(p.areaDesc || '').split(';')[0] || 'Active NWS area';
      const badge = considerable ? 'CONSIDERABLE' : label[k];
      return `<span class="ticker-item ${k}${considerable ? ' considerable' : ''}" style="border-color:${c};color:${c}"><span class="ticker-badge" style="color:${c};border-color:${c}">${icon[k]} ${esc(badge)}</span><strong>${esc(text)}</strong><small>${esc(area)}</small></span>`;
    }).join(' <span class="ticker-sep">•</span> ');
  }

  async function refresh() {
    try {
      const r = await fetch(`https://api.weather.gov/alerts/active?limit=5000&_trg_ticker=${Date.now()}`, {
        cache:'no-store',
        headers:{Accept:'application/geo+json,application/json'}
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      render(Array.isArray(data.features) ? data.features : []);
    } catch (e) {
      console.warn('TRG alert ticker refresh failed', e);
    }
  }

  refresh();
  setInterval(refresh, 60000);
})();
