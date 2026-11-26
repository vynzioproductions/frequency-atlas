/* Frequency Atlas — UI, map and live playback */
{
  const E = window.RadioEngine;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('fa:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const state = {
    station: null, tab: 'listen', week: E.nowWeek(), view: null,
    playing: null, clock: 0, recent: [], dj: store.get('dj', true),
    controller: null, ending: false, started: false,
  };
  const NOW = E.nowWeek();
  E.custom.songs = store.get('custom', []);

  // ---------------- map ----------------
  const map = L.map('map', { zoomControl: false, worldCopyJump: true, attributionControl: true }).setView([38.5, -97], window.innerWidth < 760 ? 3 : 4);
  // Dark basemap that needs no API key (Esri), with OpenStreetMap darkened by CSS as a backup
  const esriAttr = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
  const base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, attribution: esriAttr }).addTo(map);
  const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, minZoom: 3, pane: 'overlayPane', opacity: 0.8 }).addTo(map);
  let tileErrors = 0;
  base.on('tileerror', () => {
    if (++tileErrors !== 6) return;
    map.removeLayer(base); map.removeLayer(labels);
    document.getElementById('map').classList.add('osm-dark');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 3, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // zoomed out, the stations crowd together: show names only on hover until you zoom in
  const syncLabels = () => document.getElementById('map').classList.toggle('far', map.getZoom() < 5);
  map.on('zoomend', syncLabels); syncLabels();

  // stations you built in the app (saved in this browser)
  store.get('stations', []).forEach(st => { try { E.addStation(st); } catch { /* skip a broken saved station */ } });

  const markers = {};
  function addMarker(st, i = Object.keys(markers).length) {
    if (markers[st.id]) map.removeLayer(markers[st.id]);
    const html = `<div class="stn${['tucson', 'nyc', 'vegas'].includes(st.id) ? ' below' : ''}${st.custom ? ' mine' : ''}" style="--c:${st.color};--d:${(i * 0.33 % 2.6).toFixed(2)}s"><span class="stn-ring"></span><span class="stn-dot"></span>
      <span class="stn-label"><b>${esc(st.name)}</b><span>${esc(st.city)}</span></span></div>`;
    const icon = L.divIcon({ html, className: '', iconSize: [0, 0] });
    markers[st.id] = L.marker([st.lat, st.lon], { icon, title: `${st.name} — ${st.city}`, keyboard: true }).addTo(map)
      .on('click', () => go('station-' + st.id));
  }
  function removeMarker(id) { if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; } }
  E.STATIONS.forEach((st, i) => addMarker(st, i));

  // ---------------- station list ----------------
  function renderDial() {
    $('#dialList').innerHTML = E.STATIONS.map(st => `<li><button data-st="${st.id}" style="--c:${st.color}"><span class="sw"></span>
      <span><span class="nm">${esc(st.name)}${st.custom ? ' <span class="badge plant">YOURS</span>' : ''}</span><br><span class="ct">${esc(st.city)}, ${esc(st.state)}</span></span><span class="fq">${esc(st.call)}</span></button></li>`).join('')
      + `<li><button data-build="1" style="--c:#eef1f7"><span class="sw"></span><span><span class="nm">Build a station</span><br><span class="ct">Put your own station on the map</span></span><span class="fq">＋</span></button></li>`;
  }
  renderDial();
  $('#dialList').addEventListener('click', e => {
    const b = e.target.closest('[data-st],[data-build]'); if (!b) return;
    toggleDial(false); go(b.dataset.build ? 'build' : 'station-' + b.dataset.st);
  });
  function toggleDial(open) { const d = $('#dial'); d.hidden = !open; $('#btnStations').setAttribute('aria-expanded', String(open)); }
  $('#btnStations').addEventListener('click', () => toggleDial($('#dial').hidden));
  $('#btnNetwork').addEventListener('click', () => go('network'));
  $('#brand').addEventListener('click', e => { e.preventDefault(); go(''); });
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]'); if (!c) return;
    if (c.dataset.close === 'dial') toggleDial(false); else go('');
  });

  // ---------------- routing ----------------
  function go(hash) { if (location.hash.slice(1) === hash) route(); else location.hash = hash; }
  window.addEventListener('hashchange', route);
  function route() {
    const h = location.hash.slice(1);
    Object.values(markers).forEach(m => m.getElement()?.querySelector('.stn')?.classList.remove('on'));
    if (h.startsWith('station-') && E.byId[h.slice(8)]) {
      const st = E.byId[h.slice(8)];
      if (state.view !== st.id) { state.week = NOW; state.tab = 'listen'; }
      state.view = st.id;
      markers[st.id].getElement()?.querySelector('.stn')?.classList.add('on');
      // keep the station visible beside the panel (desktop) or above the sheet (phone)
      const z = Math.max(map.getZoom(), 5), wide = window.innerWidth > 760;
      const pt = map.project([st.lat, st.lon], z).subtract(wide ? [Math.min(440, window.innerWidth) / 2, 0] : [0, -window.innerHeight * 0.28]);
      map.flyTo(map.unproject(pt, z), z, { duration: 0.8 });
      renderStation(st);
    } else if (h === 'build' || h.startsWith('build-')) {
      state.view = h; window.RadioBuilder?.open(h === 'build' ? null : E.byId[h.slice(6)]);
    } else if (h === 'network') {
      if (state.view !== 'network') state.week = NOW;
      state.view = 'network'; renderNetwork();
    } else { state.view = null; $('#panel').hidden = true; }
    if (!h.startsWith('build')) window.RadioBuilder?.close();
  }

  // ---------------- station panel ----------------
  function renderStation(st) {
    const p = $('#panel'); p.hidden = false; p.style.setProperty('--c', st.color);
    const onAir = state.station?.id === st.id;
    $('#panelBody').innerHTML = `
      <div class="hero" style="--c:${st.color}">
        <div class="hero-top">
          <div class="logo">${esc(st.freq.split(' ')[0])}<small>${esc(st.call)}</small></div>
          <div><h2>${esc(st.name)}</h2><div class="sub"><b>${esc(st.slogan)}</b> · ${esc(st.city)}, ${esc(st.state)}</div></div>
        </div>
        <div class="listen">
          <button class="btn btn-main" id="btnListen">${onAir ? '⏭ Next song' : '▶ Listen live'}</button>
          <span class="live"><i></i>On air: ${esc(DJ.onAir(st).name)} · ${esc(DJ.localTime(st).text)}</span>
        </div>
        <div class="tabs" role="tablist">
          ${[['listen', 'Up next'], ['chart', 'Top 30'], ['plants', 'Plants'], ['about', 'Station']].map(([k, l]) =>
            `<button role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="tabpane" id="tabpane"></div>`;
    $('#btnListen').addEventListener('click', () => { if (state.station?.id !== st.id) tuneIn(st); else skip(); renderStation(st); });
    $('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { state.tab = b.dataset.tab; renderStation(st); } });
    const pane = $('#tabpane');
    if (state.tab === 'listen') paneListen(st, pane);
    if (state.tab === 'chart') paneChart(st, pane);
    if (state.tab === 'plants') panePlants(st, pane);
    if (state.tab === 'about') paneAbout(st, pane);
  }

  const CAT = { power: 'POWER', currents: 'CURRENT', medium: 'CURRENT', adds: 'NEW', deep: 'DEEP CUT', recurrents: 'RECURRENT', plants: 'PLANT', gold: 'THROWBACK', pick: 'REQUEST' };

  function paneListen(st, pane) {
    const rot = E.rotation(st, NOW);
    const ahead = state.station?.id === st.id ? peekAhead(5) : [];
    const block = (title, list, cat) => list.length ? `<div class="sec"><h3>${title}</h3><ul class="gold">${list.map(s =>
      `<li data-play="${esc(s.id)}" data-cat="${cat}"><div><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div><span class="yr">${s.year ? esc(s.year) : '▶'}</span></li>`).join('')}</ul></div>` : '';
    pane.innerHTML = `
      ${ahead.length ? block('Coming up on ' + esc(st.name), ahead.map(a => a.song), 'pick') : `<p class="lead">Press <b>Listen live</b> to start the stream. Songs play through Spotify; log in to Spotify in this browser to hear full tracks instead of 30-second previews.</p>`}
      ${block('Brand new this week', rot.adds.slice(0, 8), 'adds')}
      ${block('Power rotation', rot.power, 'power')}`;
    bindPlay(pane, st);
  }

  function weekBar(k) {
    const end = E.weekEnding(k);
    return `<div class="weekbar"><button class="navbtn" data-wk="-1" aria-label="Previous week" ${k <= NOW - 12 ? 'disabled' : ''}>‹</button>
      <div class="wk">Week ending ${esc(fmtDate(end))}<small>${k === NOW ? 'This week' : (NOW - k) + ' week' + (NOW - k > 1 ? 's' : '') + ' ago'}</small></div>
      <button class="navbtn" data-wk="1" aria-label="Next week" ${k >= NOW ? 'disabled' : ''}>›</button></div>`;
  }
  function moveCls(m) { return m === 'NEW' ? 'new' : m === 'RE' ? 're' : m === '=' ? 'same' : m[0] === '▲' ? 'up' : 'down'; }

  function paneChart(st, pane) {
    const rows = E.countdown(st, state.week);
    pane.innerHTML = weekBar(state.week) + (state.week === NOW ? `<button class="btn btn-main cdbtn" id="btnCountdown">▶ Play the ${esc(DJ.chartName(st))} countdown</button>` : '') + `<ol class="chart">${rows.map(e => `
      <li class="row ${e.pos <= 3 ? 'top3' : ''}" data-play="${esc(e.song.id)}" data-cat="pick" title="Play ${esc(e.song.title)}">
        <span class="pos">${e.pos}</span><span class="mv ${moveCls(e.move)}">${esc(e.move === '=' ? '–' : e.move)}</span>
        <span class="ti"><b>${esc(e.song.title)}${e.song.kind === 'plant' ? '<span class="badge plant">PLANT</span>' : ''}</b><span>${esc(e.song.artist)}</span></span>
        <span class="st"><b>${e.spins}</b>${e.bullet ? '<span class="badge bul">●</span>' : ''} spins<br>LW ${e.lw ?? '–'} · PK ${e.pk} · ${e.wks} wk${e.wks > 1 ? 's' : ''}</span>
      </li>`).join('')}</ol>
      <p class="legend">Ranked on spins this week blended with last week. ● = spins up from last week. Debuts can enter no higher than #15, and nothing climbs more than 10 spots in a week. Songs 20+ weeks old go recurrent below #20.</p>`;
    pane.querySelectorAll('[data-wk]').forEach(b => b.addEventListener('click', () => { state.week += +b.dataset.wk; renderStation(st); }));
    $('#btnCountdown')?.addEventListener('click', () => { startCountdown(st); toast(`Counting down #30 to #1 on ${st.name}`); });
    bindPlay(pane, st);
  }

  function spark(trail, color) {
    const max = Math.max(...trail, 1), W = 120, H = 46;
    const pts = trail.map((v, i) => [4 + i * (W - 8) / (trail.length - 1), H - 6 - (v / max) * (H - 14)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-label="Spins over the last six weeks: ${trail.join(', ')}">
      <path d="${d} L ${last[0]} ${H - 4} L 4 ${H - 4} Z" fill="${color}" opacity=".15"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}"/></svg>`;
  }
  function panePlants(st, pane) {
    const rep = E.plantReport(st, NOW);
    const mine = E.custom.songs.filter(s => s.station === st.id && s.kind === 'plant');
    pane.innerHTML = `<p class="lead">Plants are discovery artists ${esc(st.name)} plays before anyone else. They start on light test spins, and the ones listeners react to break into the Top 30.</p>
      ${rep.map(r => `<div class="plant"><div><h4>${esc(r.song.title)}</h4><div class="ar">${esc(r.song.artist)}</div>
        <div class="stat"><span class="status s-${r.status.split(' ')[0].toLowerCase()}">${esc(r.status)}${r.pos ? ' · #' + r.pos : ''}</span><span>${r.spins} spins this week</span><span>${r.weeksOn} wks in rotation</span></div></div>
        ${spark(r.trail, st.color)}
        <button class="btn btn-ghost play" data-play="${esc(r.song.id)}" data-cat="plants">▶ Play</button></div>`).join('')}
      ${mine.length ? `<div class="sec" style="margin-top:18px"><h3>Your plants</h3><ul class="gold">${mine.map(s => `<li data-play="${esc(s.id)}" data-cat="plants"><div><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div><span class="yr">▶</span></li>`).join('')}</ul></div>` : ''}`;
    bindPlay(pane, st);
  }

  function paneAbout(st, pane) {
    const gold = E.goldFor(st);
    const mine = E.custom.songs.filter(s => s.station === st.id);
    pane.innerHTML = `
      ${st.custom ? `<div class="sec mineactions"><button class="btn btn-main" id="stEdit">Edit station</button><button class="btn btn-ghost" id="stCopy">Copy station code</button><button class="btn btn-ghost" id="stDel">Delete</button></div>` : ''}
      <div class="sec"><h3>About the station</h3><p>${esc(st.about || 'A station you built.')}</p></div>
      <div class="sec"><h3>On air</h3><ul class="shows">${st.shows.map(([d, n]) => `<li><span>${esc(d)}</span>${esc(n)}</li>`).join('')}</ul></div>
      <div class="sec"><h3>Throwbacks in rotation (${gold.length})</h3><ul class="gold">${gold.slice(0, 25).map(g => `<li data-play="${esc(g.id)}" data-cat="gold"><div><b>${esc(g.title)}</b><span>${esc(g.artist)}</span></div><span class="yr">${g.year}</span></li>`).join('')}</ul></div>
      <div class="sec import"><h3>Add songs to this station</h3>
        <textarea id="impText" placeholder="Paste Spotify track links, one per line"></textarea>
        <div class="r"><select id="impKind" aria-label="Add as"><option value="gold">Throwback</option><option value="adds">New music</option><option value="plant">Plant</option></select>
        <button class="btn btn-main" id="impGo">Add to ${esc(st.name)}</button></div>
        <p class="hint">In the Spotify desktop app, open a playlist, select songs (Ctrl+A or ⌘A), copy (Ctrl+C or ⌘C) and paste here. The songs are saved in this browser only.</p>
      </div>
      ${mine.length ? `<div class="sec"><h3>Your additions (${mine.length})</h3><ul class="gold mine">${mine.map(s => `<li data-play="${esc(s.id)}" data-cat="${s.kind === 'adds' ? 'adds' : s.kind === 'plant' ? 'plants' : 'gold'}"><div><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div><span class="yr">${esc(CAT[s.kind === 'plant' ? 'plants' : s.kind])}</span><button class="rm" data-rm="${esc(s.id)}">Remove</button></li>`).join('')}</ul></div>` : ''}`;
    $('#impGo').addEventListener('click', () => importSongs(st));
    if (st.custom) {
      $('#stEdit').addEventListener('click', () => go('build-' + st.id));
      $('#stCopy').addEventListener('click', () => {
        const code = JSON.stringify(window.RadioBuilder.exportable(st));
        navigator.clipboard?.writeText(code).then(() => toast('Station code copied. Paste it to Claude to make it permanent.'), () => toast('Copy failed'));
      });
      $('#stDel').addEventListener('click', ev => {
        const b = ev.currentTarget;
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; }
        window.RadioBuilder.remove(st.id);
      });
    }
    pane.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      E.custom.songs = E.custom.songs.filter(s => !(s.station === st.id && s.id === b.dataset.rm));
      store.set('custom', E.custom.songs); renderStation(st);
    }));
    bindPlay(pane, st);
  }

  async function importSongs(st) {
    const text = $('#impText').value;
    const ids = [...new Set([...text.matchAll(/(?:track[/:])([A-Za-z0-9]{22})/g)].map(m => m[1]))];
    if (!ids.length) { toast('No Spotify track links found. They look like open.spotify.com/track/…'); return; }
    const kind = $('#impKind').value;
    $('#impGo').disabled = true; $('#impGo').textContent = 'Adding…';
    let added = 0;
    for (const id of ids) {
      if (E.custom.songs.some(s => s.id === id && s.station === st.id)) continue;
      let title = 'Spotify track ' + id.slice(0, 6), artist = 'Added by you';
      try {
        const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id));
        if (r.ok) { const j = await r.json(); if (j.title) title = j.title; }
      } catch { /* oEmbed blocked: keep the placeholder name, the player still shows the real title */ }
      E.custom.songs.push({ id, title, artist, station: st.id, kind, year: '' });
      added++;
    }
    store.set('custom', E.custom.songs);
    toast(`Added ${added} song${added === 1 ? '' : 's'} to ${st.name}.`);
    renderStation(st);
  }

  function bindPlay(pane, st) {
    pane.querySelectorAll('[data-play]').forEach(el => el.addEventListener('click', ev => {
      if (ev.target.closest('[data-rm]')) return;
      const id = el.dataset.play;
      const song = E.SONGS.get(id) || [...E.GOLD.values()].find(g => g.id === id) || E.custom.songs.find(s => s.id === id) || { id, title: '', artist: '' };
      if (state.station?.id !== st.id) tuneIn(st, false);
      playSong(song, el.dataset.cat || 'pick');
    }));
  }

  // ---------------- network panel ----------------
  function renderNetwork() {
    const p = $('#panel'); p.hidden = false; p.style.setProperty('--c', '#2ee6c8');
    const comp = state.netView === 'composite';
    const C = E.COMPOSITE;
    $('#panelBody').innerHTML = `<div class="net"><div class="hero"><div class="hero-top"><div class="logo">${comp ? '50' : '40'}<small>${comp ? 'US NEW' : 'NETWORK'}</small></div>
      <div><h2>${comp ? esc(C.title || 'US New Music Chart') : 'Network Top 40'}</h2><div class="sub"><b>${comp ? 'Streaming + playlists + radio' : 'All ' + E.STATIONS.length + ' stations'}</b> · ${comp ? 'your composite chart' : 'total weekly spins'}</div></div></div>
      <div class="tabs" role="tablist" style="margin-top:14px">
        <button role="tab" data-net="network" aria-selected="${!comp}">Network Top 40</button>
        <button role="tab" data-net="composite" aria-selected="${comp}">US New Music Chart</button>
      </div></div></div>
      <div class="tabpane" id="tabpane"></div>`;
    $('.net .tabs').addEventListener('click', e => { const b = e.target.closest('[data-net]'); if (b) { state.netView = b.dataset.net; renderNetwork(); } });
    const pane = $('#tabpane');
    if (comp) {
      const rows = E.compositeChart();
      pane.innerHTML = `<div class="weekbar"><div class="wk" style="flex:1">Week ending ${esc(fmtDate(new Date(C.weekEnding + 'T12:00:00Z')))}<small>${esc(C.status || '')}</small></div></div>
        <ol class="chart">${rows.map(e => `
        <li class="row ${e.pos <= 3 ? 'top3' : ''}" style="--c:#2ee6c8" ${e.id ? `data-play="${esc(e.id)}"` : ''} title="${e.id ? 'Play ' + esc(e.title) : 'Not playable yet'}">
          <span class="pos">${e.pos}</span><span class="mv ${moveCls(e.move)}">${esc(e.move === '=' ? '–' : e.move)}</span>
          <span class="ti"><b>${esc(e.title)}</b><span>${esc(e.artist)}</span></span>
          <span class="st"><b>${e.score.toFixed(1)}</b> pts<br>LW ${e.lw ?? '–'} · PK ${e.pk} · ${e.wks} wk${e.wks > 1 ? 's' : ''}</span>
        </li>`).join('')}</ol>
        <p class="legend">Your US New Music Chart. Its scores drive how hot each song runs on every station. Tap a song to hear it on the station you last tuned to.</p>`;
      pane.querySelectorAll('[data-play]').forEach(el => el.addEventListener('click', () => {
        const song = E.SONGS.get(el.dataset.play); if (!song) return;
        if (!state.station) tuneIn(E.byId.tucson, false);
        playSong(song, 'pick');
      }));
      return;
    }
    const rows = E.networkChart(state.week);
    pane.innerHTML = weekBar(state.week) + `<ol class="chart">${rows.map(e => `
      <li class="row ${e.pos <= 3 ? 'top3' : ''}" style="--c:#2ee6c8">
        <span class="pos">${e.pos}</span><span class="mv ${moveCls(e.move)}">${esc(e.move === '=' ? '–' : e.move)}</span>
        <span class="ti"><b>${esc(e.song.title)}</b><span>${esc(e.song.artist)}</span></span>
        <span class="st"><b>${e.spins.toLocaleString()}</b>${e.bullet ? '<span class="badge bul">●</span>' : ''} spins<br>${e.stations}/${E.STATIONS.length} stations · PK ${e.pk}</span>
      </li>`).join('')}</ol><p class="legend">Total spins across every station. "Stations" counts how many station Top 30s the song is on this week.
      ${E.AUTO.chartDate ? `Rotations last refreshed from the Spotify US weekly chart dated ${esc(fmtDate(new Date(E.AUTO.chartDate + 'T12:00:00Z')))}.` : 'Rotations come from your US New Music Chart, the seed song list and your playlists until the first weekly Spotify update runs.'}</p>`;
    pane.querySelectorAll('[data-wk]').forEach(b => b.addEventListener('click', () => { state.week += +b.dataset.wk; renderNetwork(); }));
  }

  // ---------------- live stream ----------------
  const CLOCK = ['power', 'currents', 'adds', 'power', 'gold', 'deep', 'currents', 'plants', 'power', 'medium', 'adds', 'currents', 'gold', 'power', 'deep', 'recurrents'];
  function pickFrom(rot, cat, avoid) {
    const list = rot[cat] || [];
    const fresh = list.filter(s => !avoid.has(s.id));
    const pool = fresh.length ? fresh : list;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function nextFromClock(simulate) {
    const rot = E.rotation(state.station, NOW);
    let clock = simulate ? simulate.clock : state.clock;
    const avoid = new Set((simulate ? simulate.recent : state.recent).slice(-24));
    for (let tries = 0; tries < CLOCK.length; tries++) {
      const cat = CLOCK[clock % CLOCK.length]; clock++;
      const song = pickFrom(rot, cat, avoid);
      if (song) {
        if (simulate) { simulate.clock = clock; simulate.recent.push(song.id); } else state.clock = clock;
        return { song, cat };
      }
    }
    return null;
  }
  // Peek at what's coming without changing the real queue: we precompute and store it.
  function peekAhead(n) {
    while (state.queue.length < n) {
      const sim = { clock: state.clock, recent: [...state.recent, ...state.queue.map(q => q.song.id)] };
      const nx = nextFromClock(sim); if (!nx) break;
      state.clock = sim.clock; state.queue.push(nx);
    }
    return state.queue.slice(0, n);
  }
  state.queue = [];

  const DJ = window.RadioDJ;
  state.cd = []; // countdown-show queue

  function tuneIn(st, autoplay = true) {
    state.station = st; state.clock = Math.floor(Math.random() * CLOCK.length); state.queue = []; state.recent = []; state.cd = []; state.last = null;
    const pl = $('#player'); pl.hidden = false; pl.style.setProperty('--c', st.color);
    updatePlayerHead();
    DJ.unlock();
    if (autoplay) {
      const show = DJ.onAir(st);
      peekAhead(1);
      const nx = state.queue[0];
      talk([`You're tuned to ${st.name}, ${st.call} ${st.city}. This is ${show.name}.`, nx ? DJ.frontSell(st, nx.song, nx.cat) : ''], true).then(() => skip(true));
    }
  }
  function updatePlayerHead() {
    const st = state.station; if (!st) return;
    $('#plStation').textContent = state.cd.length || state.inCountdown ? `${DJ.chartName(st)} countdown · ${st.name}` : `${st.name} · ${DJ.onAir(st).name}`;
  }

  // speak a talk break (optionally after the station's sonic logo)
  async function talk(lines, withSting) {
    const st = state.station; if (!st || !state.dj) return;
    const text = lines.filter(Boolean).join(' ');
    $('#plCat').textContent = 'ON AIR'; $('#plTitle').textContent = DJ.onAir(st).name;
    if (withSting) await DJ.sting(st);
    if (text) await DJ.say(st, text);
  }

  // pick and play the next song; quiet = no talk (manual skip)
  function skip(quiet) {
    let nx;
    if (state.cd.length) { nx = state.cd.shift(); state.inCountdown = true; }
    else { state.inCountdown = false; peekAhead(1); nx = state.queue.shift(); }
    if (!nx) return;
    playSong(nx.song, nx.cat);
    updatePlayerHead();
    if (state.view === state.station?.id && state.tab === 'listen') renderStation(state.station);
  }

  function playSong(song, cat) {
    if (state.playing) state.last = state.playing;
    state.playing = song; state.playingCat = cat; state.ending = false;
    state.recent.push(song.id); if (state.recent.length > 60) state.recent.shift();
    $('#plCat').textContent = CAT[cat] || (String(cat).startsWith('#') ? cat : ''); $('#plTitle').textContent = song.title ? `${song.title} — ${song.artist}` : 'Loading…';
    const uri = 'spotify:track:' + song.id;
    if (state.controller) { state.controller.loadUri(uri); state.controller.play(); }
    else { state.pendingUri = uri; }
  }

  let sinceTalk = 0, sinceSting = 0;
  async function onEnded() {
    if (state.ending) return; state.ending = true;
    const st = state.station; if (!st) return;
    const prev = state.playing;
    if (state.cd.length) {                       // countdown show: every song gets an intro
      const nx = state.cd[0];
      await talk([DJ.countdownIntro(st, nx.row, false)], nx.row.pos % 10 === 0);
      return skip(true);
    }
    if (state.inCountdown) {                      // the countdown just finished
      state.inCountdown = false;
      await talk([`That's the ${DJ.chartName(st)} for this week. Thanks for counting down with us on ${st.name}.`], true);
      return skip(true);
    }
    sinceTalk++; sinceSting++;
    peekAhead(1);
    const nx = state.queue[0];
    if (state.dj && sinceTalk >= 2) {
      sinceTalk = 0;
      const sting = sinceSting >= 4; if (sting) sinceSting = 0;
      const lines = sting ? [DJ.stationId(st), nx ? DJ.frontSell(st, nx.song, nx.cat) : '']
        : [DJ.backAnnounce(st, prev), nx ? DJ.frontSell(st, nx.song, nx.cat) : ''];
      await talk(lines, sting);
    } else if (state.dj && nx && (nx.cat === 'plants' || nx.cat === 'adds') && Math.random() < 0.6) {
      await talk([DJ.frontSell(st, nx.song, nx.cat)], false);   // always flag new music and plants
    }
    skip(true);
  }

  async function startCountdown(st) {
    if (state.station?.id !== st.id) tuneIn(st, false);
    DJ.unlock();
    const rows = E.countdown(st, NOW).slice().reverse();
    state.cd = rows.map(row => ({ song: row.song, cat: '#' + row.pos, row }));
    state.inCountdown = true; updatePlayerHead();
    const first = state.cd[0];
    await talk([DJ.countdownIntro(st, first.row, true)], true);
    skip(true);
  }

  $('#plSkip').addEventListener('click', () => { try { speechSynthesis.cancel(); } catch { /* no speech */ } skip(true); });
  const vBtn = $('#plVoice'); vBtn.textContent = 'DJ'; vBtn.title = 'DJ talk breaks and station IDs';
  vBtn.setAttribute('aria-pressed', String(state.dj));
  vBtn.addEventListener('click', () => { state.dj = !state.dj; store.set('dj', state.dj); vBtn.setAttribute('aria-pressed', String(state.dj)); toast(state.dj ? 'DJs on' : 'DJs off, music only'); });

  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    const el = document.getElementById('spotifyEmbed');
    IFrameAPI.createController(el, { width: '100%', height: 80, uri: state.pendingUri || 'spotify:track:2sFepQNyl1WjpROruP8bJ0' }, (controller) => {
      state.controller = controller;
      let lastPos = 0, wasPlaying = false;
      controller.addListener('playback_update', (e) => {
        const { isPaused, position, duration } = e.data || {};
        if (!duration) return;
        if (!isPaused) wasPlaying = true;
        const nearEnd = position >= duration - 1200;
        const resetAfterEnd = isPaused && wasPlaying && position === 0 && lastPos >= duration - 3000;
        if ((nearEnd && !isPaused) || resetAfterEnd) { wasPlaying = false; onEnded(); }
        lastPos = position;
      });
      if (state.pendingUri) { controller.loadUri(state.pendingUri); controller.play(); state.pendingUri = null; }
    });
  };

  // ---------------- misc ----------------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.RadioApp = { map, go, toast, esc, store, addMarker, removeMarker, renderDial, markers, nowWeek: NOW,
    stopIf: (id) => { if (state.station?.id === id) { state.station = null; $('#player').hidden = true; } } };
  route();
  if (!location.hash) setTimeout(() => toast('Tap a glowing dot to tune in'), 600);
}
