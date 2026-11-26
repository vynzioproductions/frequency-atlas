/* Station builder: place a station on the map, shape its sound, and watch its Top 10 change live. */
{
  const E = window.RadioEngine, A = window.RadioApp, DJ = window.RadioDJ;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = A.esc;
  const TAGS = [['pop', 'Pop'], ['dance', 'Dance'], ['rnb', 'R&B'], ['indie', 'Indie'], ['alt', 'Alt'], ['latin', 'Latin'], ['country', 'Country'], ['kpop', 'K-pop'], ['rap', 'Hip-hop']];
  const PRESETS = {
    'Top 40': { pop: 1.2, dance: 1.1, rnb: 1, indie: 0.9, alt: 0.9, latin: 0.9, country: 0.8, kpop: 1, rap: 0.3 },
    'Rhythmic': { pop: 0.9, dance: 1.4, rnb: 1.6, indie: 0.6, alt: 0.5, latin: 1.2, country: 0.3, kpop: 1, rap: 1.1 },
    'Hot AC': { pop: 1.2, dance: 0.8, rnb: 0.9, indie: 1.2, alt: 1.1, latin: 0.5, country: 0.9, kpop: 0.5, rap: 0.05 },
    'Alt pop': { pop: 0.9, dance: 0.8, rnb: 0.8, indie: 1.4, alt: 1.7, latin: 0.5, country: 0.7, kpop: 0.6, rap: 0.1 },
    'Indie': { pop: 0.8, dance: 0.7, rnb: 1, indie: 1.9, alt: 1.3, latin: 0.5, country: 0.9, kpop: 0.5, rap: 0.1 },
    'Dance': { pop: 1, dance: 2, rnb: 1.1, indie: 0.7, alt: 0.7, latin: 1.1, country: 0.3, kpop: 1.1, rap: 0.3 },
    'Latin pop': { pop: 0.9, dance: 1.2, rnb: 1, indie: 0.5, alt: 0.4, latin: 2.4, country: 0.3, kpop: 0.8, rap: 0.4 },
    'Country pop': { pop: 1, dance: 0.5, rnb: 0.7, indie: 1.1, alt: 0.9, latin: 0.5, country: 2.2, kpop: 0.4, rap: 0.1 },
    'K-pop': { pop: 1, dance: 1.2, rnb: 1, indie: 0.7, alt: 0.7, latin: 0.8, country: 0.3, kpop: 2.4, rap: 0.3 },
  };
  const COLORS = ['#ff8a3d', '#2ee6c8', '#ff3d8b', '#ffd23d', '#4da3ff', '#c46bff', '#b8f05c', '#ff5a5a', '#5ce1e6', '#ff4fd8'];

  let draft = null, editing = null, pin = null, mapClick = null, timer = null;

  // ---------- helpers ----------
  const westOfMississippi = (lon) => lon < -90.1;
  function suggestCall(lon) {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const taken = new Set(E.STATIONS.map(s => s.call));
    for (let i = 0; i < 50; i++) {
      const c = (westOfMississippi(lon) ? 'K' : 'W') + Array.from({ length: 3 }, () => L[Math.floor(Math.random() * 26)]).join('');
      if (!taken.has(c)) return c;
    }
    return 'KNEW';
  }
  const FREQS = []; for (let f = 881; f <= 1079; f += 2) FREQS.push((f / 10).toFixed(1));
  function suggestFreq() {
    const taken = new Set(E.STATIONS.map(s => s.freq.split(' ')[0]));
    const open = FREQS.filter(f => +f >= 92 && !taken.has(f));
    return open[Math.floor(Math.random() * open.length)] || '99.9';
  }
  function tzFor(lat, lon, state) {
    const s = String(state).toUpperCase();
    if (s === 'AZ') return 'America/Phoenix';
    if (s === 'HI') return 'Pacific/Honolulu';
    if (s === 'AK') return 'America/Anchorage';
    if (lon >= -85.5) return 'America/New_York';
    if (lon >= -101) return 'America/Chicago';
    if (lon >= -114.5) return 'America/Denver';
    return 'America/Los_Angeles';
  }
  const baseName = (name) => String(name || 'My Station').replace(/^the /i, '').replace(/\s*[\d.]+(\s*fm)?$/i, '').trim() || 'My Station';

  function blank() {
    const c = A.map.getCenter();
    return {
      id: '', name: '', slogan: '', city: '', state: '', lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), placed: false,
      call: suggestCall(c.lng), freq: suggestFreq(), color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tags: { ...PRESETS['Top 40'] }, nb: 0.35, clean: false, home: [], about: '',
      shows: [['Mornings', ''], ['Middays', ''], ['Nights', ''], ['Sundays', '']], plants: [],
    };
  }

  // ---------- map pin ----------
  function setPin(lat, lon) {
    draft.lat = +lat.toFixed(4); draft.lon = +lon.toFixed(4); draft.placed = true;
    const icon = L.divIcon({ html: `<div class="stn mine" style="--c:${draft.color};--d:0s"><span class="stn-ring"></span><span class="stn-dot"></span><span class="stn-label"><b>${esc(draft.name || 'New station')}</b><span>${esc(draft.city || 'Drag the map, click to move')}</span></span></div>`, className: '', iconSize: [0, 0] });
    if (pin) pin.setLatLng([draft.lat, draft.lon]).setIcon(icon); else pin = L.marker([draft.lat, draft.lon], { icon, interactive: false }).addTo(A.map);
  }
  async function reverseGeocode(lat, lon) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`, { headers: { 'Accept-Language': 'en' } });
      if (!r.ok) return;
      const j = await r.json(), a = j.address || {};
      const city = a.city || a.town || a.village || a.hamlet || a.county || '';
      const code = (a['ISO3166-2-lvl4'] || '').split('-')[1] || '';
      if (city && !$('#bCity').dataset.touched) { $('#bCity').value = city; draft.city = city; }
      if (code && !$('#bState').dataset.touched) { $('#bState').value = code; draft.state = code; }
      setPin(draft.lat, draft.lon); refresh();
    } catch { /* offline or blocked: user types the city */ }
  }

  // ---------- panel ----------
  function open(st) {
    editing = st && st.custom ? st : null;
    draft = editing ? JSON.parse(JSON.stringify({ ...exportable(editing), placed: true })) : blank();
    if (!draft.id) draft.newId = 'c-' + Math.random().toString(36).slice(2, 8);
    if (!draft.shows || draft.shows.length < 4) draft.shows = [['Mornings', ''], ['Middays', ''], ['Nights', ''], ['Sundays', '']];
    const p = $('#panel'); p.hidden = false; p.style.setProperty('--c', draft.color);
    render();
    if (editing) { setPin(draft.lat, draft.lon); A.map.flyTo([draft.lat, draft.lon], Math.max(A.map.getZoom(), 6), { duration: 0.6 }); }
    if (mapClick) A.map.off('click', mapClick);
    mapClick = (e) => { setPin(e.latlng.lat, e.latlng.lng); $('#bWhere').textContent = 'Placed. Click the map again to move it.'; reverseGeocode(draft.lat, draft.lon); if (!editing && !$('#bCall').dataset.touched) { draft.call = suggestCall(draft.lon); $('#bCall').value = draft.call; } refresh(); };
    A.map.on('click', mapClick);
    document.getElementById('map').classList.add('placing');
  }
  function close() {
    if (mapClick) { A.map.off('click', mapClick); mapClick = null; }
    if (pin) { A.map.removeLayer(pin); pin = null; }
    document.getElementById('map').classList.remove('placing');
    draft = null; editing = null;
  }

  function render() {
    const d = draft;
    const sl = TAGS.map(([k, label]) => `<label class="sl"><span>${label}</span><input type="range" min="0" max="2.5" step="0.05" data-tag="${k}" value="${d.tags[k] ?? 1}"><output>${(d.tags[k] ?? 1).toFixed(2)}</output></label>`).join('');
    $('#panelBody').innerHTML = `
      <div class="hero" style="--c:${d.color}">
        <div class="hero-top"><div class="logo" id="bLogo">${esc(d.freq)}<small>${esc(d.call)}</small></div>
        <div><h2>${editing ? 'Edit station' : 'Build a station'}</h2><div class="sub" id="bWhere">${d.placed ? 'Placed. Click the map again to move it.' : '<b>Click anywhere on the map</b> to place your tower.'}</div></div></div>
        <div style="height:14px"></div>
      </div>
      <div class="tabpane builder">
        <div class="grid2">
          <label class="fld"><span>Station name</span><input id="bName" maxlength="28" placeholder="Pine 98.5" value="${esc(d.name)}"></label>
          <label class="fld"><span>Slogan</span><input id="bSlogan" maxlength="48" placeholder="Flagstaff's New Music" value="${esc(d.slogan)}"></label>
          <label class="fld"><span>City</span><input id="bCity" maxlength="32" value="${esc(d.city)}"></label>
          <label class="fld"><span>State</span><input id="bState" maxlength="2" value="${esc(d.state)}" style="text-transform:uppercase"></label>
          <label class="fld"><span>Call letters</span><div class="row2"><input id="bCall" maxlength="4" value="${esc(d.call)}" style="text-transform:uppercase"><button class="ic" id="bCallDice" title="Suggest call letters" aria-label="Suggest call letters">↻</button></div><small id="bCallHint"></small></label>
          <label class="fld"><span>Frequency (FM)</span><select id="bFreq">${FREQS.map(f => `<option ${f === d.freq ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
        </div>
        <div class="fld"><span>Color</span><div class="swatches">${COLORS.map(c => `<button class="swb" data-color="${c}" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === d.color}"></button>`).join('')}<input type="color" id="bColor" value="${esc(d.color)}" aria-label="Custom color"></div></div>

        <h3 class="bh">Sound</h3>
        <div class="presets">${Object.keys(PRESETS).map(n => `<button class="chip" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <div class="sliders">${sl}
          <label class="sl nb"><span>New music</span><input type="range" min="0" max="0.8" step="0.05" id="bNb" value="${d.nb}"><output>${Math.round(d.nb * 100)}%</output></label>
        </div>
        <label class="chk"><input type="checkbox" id="bClean" ${d.clean ? 'checked' : ''}> Clean station: skip explicit songs</label>

        <h3 class="bh">Live preview: this week's Top 10</h3>
        <ol class="preview" id="bPreview"></ol>

        <h3 class="bh">On air</h3>
        <div class="grid2">${d.shows.map(([slot, name], i) => `<label class="fld"><span>${esc(slot)}</span><input data-show="${i}" maxlength="40" placeholder="${esc(defaultShow(slot))}" value="${esc(name)}"></label>`).join('')}</div>

        <h3 class="bh">Throwback artists</h3>
        <label class="fld"><span>Signature artists, comma separated (they get first dibs on throwback slots)</span><input id="bHome" value="${esc(d.home.join(', '))}" placeholder="Imagine Dragons, Noah Kahan"></label>

        <h3 class="bh">Plants</h3>
        <label class="fld"><span>Paste Spotify track links for discovery artists. The first one is set up to break out.</span><textarea id="bPlants" placeholder="https://open.spotify.com/track/…">${esc(d.plants.map(p => 'https://open.spotify.com/track/' + p[0]).join('\n'))}</textarea></label>
        <ul class="gold" id="bPlantList">${d.plants.map(p => `<li><div><b>${esc(p[1])}</b><span>${esc(p[2])}</span></div><span class="yr">${p === d.plants[0] ? 'BREAKOUT' : 'TEST'}</span></li>`).join('')}</ul>

        <label class="fld"><span>About (optional)</span><textarea id="bAbout" maxlength="300" placeholder="What makes this station different?">${esc(d.about)}</textarea></label>

        <div class="bactions">
          <button class="btn btn-main" id="bSave">${editing ? 'Save changes' : 'Put it on the air'}</button>
          <button class="btn btn-ghost" id="bCancel">Cancel</button>
          ${editing ? '' : '<button class="btn btn-ghost" id="bImport">Paste station code</button>'}
        </div>
        <p class="hint" id="bErr" role="alert"></p>
      </div>`;
    bind(); refresh();
  }
  function defaultShow(slot) {
    const b = baseName(draft.name);
    return { Mornings: `${b} Mornings`, Middays: `Middays on ${b}`, Nights: `${b} After Dark`, Sundays: `The ${b} 30` }[slot] || slot;
  }

  function bind() {
    const d = draft, body = $('#panelBody');
    const upd = (id, key, fn = (v) => v) => $(id).addEventListener('input', e => { e.target.dataset.touched = '1'; d[key] = fn(e.target.value); refreshSoon(); });
    upd('#bName', 'name'); upd('#bSlogan', 'slogan'); upd('#bCity', 'city'); upd('#bState', 'state', v => v.toUpperCase()); upd('#bAbout', 'about');
    upd('#bCall', 'call', v => v.toUpperCase().replace(/[^A-Z]/g, ''));
    upd('#bHome', 'home', v => v.split(',').map(s => s.trim()).filter(Boolean));
    $('#bFreq').addEventListener('change', e => { d.freq = e.target.value; refresh(); });
    $('#bCallDice').addEventListener('click', e => { e.preventDefault(); d.call = suggestCall(d.lon); $('#bCall').value = d.call; refresh(); });
    body.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => setColor(b.dataset.color)));
    $('#bColor').addEventListener('input', e => setColor(e.target.value));
    body.querySelectorAll('[data-tag]').forEach(r => r.addEventListener('input', () => { d.tags[r.dataset.tag] = +r.value; r.nextElementSibling.textContent = (+r.value).toFixed(2); refreshSoon(); }));
    $('#bNb').addEventListener('input', e => { d.nb = +e.target.value; e.target.nextElementSibling.textContent = Math.round(d.nb * 100) + '%'; refreshSoon(); });
    $('#bClean').addEventListener('change', e => { d.clean = e.target.checked; refresh(); });
    body.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      d.tags = { ...PRESETS[b.dataset.preset] };
      body.querySelectorAll('[data-tag]').forEach(r => { r.value = d.tags[r.dataset.tag]; r.nextElementSibling.textContent = (+r.value).toFixed(2); });
      refresh();
    }));
    body.querySelectorAll('[data-show]').forEach(inp => inp.addEventListener('input', () => { d.shows[+inp.dataset.show][1] = inp.value; }));
    $('#bPlants').addEventListener('change', readPlants);
    $('#bSave').addEventListener('click', save);
    $('#bCancel').addEventListener('click', () => A.go(editing ? 'station-' + editing.id : ''));
    $('#bImport')?.addEventListener('click', importCode);
  }
  function setColor(c) {
    draft.color = c; $('#panel').style.setProperty('--c', c); $('.hero', $('#panelBody')).style.setProperty('--c', c);
    document.querySelectorAll('.swb').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === c)));
    if (pin) setPin(draft.lat, draft.lon);
    refresh();
  }

  async function readPlants() {
    const ids = [...new Set([...$('#bPlants').value.matchAll(/track[/:]([A-Za-z0-9]{22})/g)].map(m => m[1]))].slice(0, 5);
    const old = new Map(draft.plants.map(p => [p[0], p]));
    const out = [];
    for (const id of ids) {
      if (old.has(id)) { out.push(old.get(id)); continue; }
      const known = E.SONGS.get(id);
      let title = known?.title || 'Spotify track ' + id.slice(0, 6), artist = known?.artist || 'New artist';
      if (!known) {
        try { const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id)); if (r.ok) { const j = await r.json(); if (j.title) title = j.title; } } catch { /* keep placeholder */ }
      }
      out.push([id, title, artist, 'pop', 14, 1, 'up']);
    }
    out.forEach((p, i) => { p[4] = i === 0 ? 46 : 14; p[5] = i === 0 ? 3 : 1; });
    draft.plants = out;
    $('#bPlantList').innerHTML = out.map((p, i) => `<li><div><b>${esc(p[1])}</b><span>${esc(p[2])}</span></div><span class="yr">${i === 0 ? 'BREAKOUT' : 'TEST'}</span></li>`).join('');
  }

  function refreshSoon() { clearTimeout(timer); timer = setTimeout(refresh, 120); }
  function refresh() {
    if (!draft) return;
    const d = draft;
    $('#bLogo').innerHTML = `${esc(d.freq)}<small>${esc(d.call || '----')}</small>`;
    const hint = $('#bCallHint');
    if (hint) {
      const want = westOfMississippi(d.lon) ? 'K' : 'W';
      hint.textContent = !/^[KW][A-Z]{2,3}$/.test(d.call) ? 'US calls start with K or W, then 2–3 letters.'
        : d.call[0] !== want ? `Heads up: stations ${want === 'K' ? 'west' : 'east'} of the Mississippi usually start with ${want}.` : '';
    }
    const rows = E.previewChart({ id: d.id || d.newId, tags: d.tags, nb: d.nb, clean: d.clean, plants: [] }, 10);
    $('#bPreview').innerHTML = rows.map((r, i) => `<li><span class="pp">${i + 1}</span><span class="ti"><b>${esc(r.song.title)}</b><span>${esc(r.song.artist)}</span></span><span class="ps">${r.spins}</span></li>`).join('');
    document.querySelectorAll('[data-show]').forEach(inp => { inp.placeholder = defaultShow(d.shows[+inp.dataset.show][0]); });
    if (pin) setPin(d.lat, d.lon);
  }

  function validate() {
    const d = draft, errs = [];
    if (!d.placed) errs.push('click the map to place the station');
    if (!d.name.trim()) errs.push('give it a name');
    if (!d.city.trim()) errs.push('add the city');
    if (!/^[KW][A-Z]{2,3}$/.test(d.call)) errs.push('call letters must be K or W plus 2–3 letters');
    if (E.STATIONS.some(s => s.call === d.call && s.id !== d.id)) errs.push(`${d.call} is already taken`);
    return errs;
  }

  function exportable(st) {
    const { id, name, slogan, city, state, lat, lon, call, freq, color, tags, nb, clean, home, about, shows, plants, tz } = st;
    return { id, name, slogan, city, state, lat, lon, call, freq: String(freq).split(' ')[0], color, tags, nb, clean: !!clean, home, about, shows, plants, tz };
  }

  function save() {
    const errs = validate();
    if (errs.length) { $('#bErr').textContent = 'Almost there: ' + errs.join(', ') + '.'; return; }
    const d = draft;
    const id = d.id || d.newId;
    const st = {
      id, custom: true, name: d.name.trim(), slogan: d.slogan.trim() || `${d.city}'s New Music`, city: d.city.trim(), state: (d.state || '').trim().toUpperCase(),
      lat: d.lat, lon: d.lon, call: d.call, freq: d.freq + ' FM', color: d.color, tags: { ...d.tags }, nb: d.nb, clean: d.clean, home: d.home,
      about: d.about.trim(), shows: d.shows.map(([slot, name]) => [slot, name.trim() || defaultShow(slot)]), plants: d.plants, gold: [],
      tz: tzFor(d.lat, d.lon, d.state), launched: new Date().getFullYear(),
    };
    E.addStation(st);
    const saved = A.store.get('stations', []).filter(s => s.id !== id);
    saved.push(exportable(st)); A.store.set('stations', saved);
    close();
    A.addMarker(st); A.renderDial();
    A.toast(`${st.name} is on the air`);
    A.go('station-' + id);
  }

  function remove(id) {
    E.removeStation(id); A.removeMarker(id); A.stopIf(id);
    A.store.set('stations', A.store.get('stations', []).filter(s => s.id !== id));
    A.renderDial(); A.toast('Station deleted'); A.go('');
  }

  function importCode() {
    const box = document.createElement('div');
    box.className = 'fld'; box.innerHTML = `<span>Paste a station code</span><textarea id="bCode"></textarea><button class="btn btn-main" id="bCodeGo" style="margin-top:8px">Load it</button>`;
    $('#bErr').before(box);
    $('#bCodeGo').addEventListener('click', () => {
      try {
        const st = JSON.parse($('#bCode').value);
        if (!st.name || !st.tags || typeof st.lat !== 'number') throw new Error('bad');
        const freq = String(st.freq || '').split(' ')[0];
        draft = { ...blank(), ...st, freq: FREQS.includes(freq) ? freq : suggestFreq(), id: '', placed: true, home: st.home || [], plants: st.plants || [] };
        render(); setPin(draft.lat, draft.lon); A.map.flyTo([draft.lat, draft.lon], 6, { duration: 0.6 });
      } catch { $('#bErr').textContent = "That code didn't look right. Copy it again with Copy station code."; }
    });
  }

  window.RadioBuilder = { open, close, remove, exportable };
  if (location.hash.startsWith('#build')) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
