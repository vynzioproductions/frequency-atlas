/* Cross-device sync for stations you build and songs you add.
   - Everyone: the site loads stations.json from your repo, so published stations show on every device.
   - Your devices: connect once with a GitHub token and every save is published to stations.json automatically.
   - No token? "Copy sync link" moves your stations to another browser in one tap. */
{
  const E = window.RadioEngine, A = window.RadioApp;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = A.esc;
  const FILE = 'stations.json';

  function guessRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return m ? { owner: m[1], repo: seg && !seg.includes('.') ? seg : `${m[1]}.github.io` } : { owner: '', repo: '' };
  }
  const cfg = () => A.store.get('sync', null);
  const connected = () => { const c = cfg(); return !!(c && c.token && c.owner && c.repo); };

  // ---------- encode / decode ----------
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s)));
  function payload() {
    return {
      updated: new Date().toISOString(),
      stations: A.store.get('stations', []),
      songs: E.custom.songs,
    };
  }

  // ---------- apply stations/songs coming from elsewhere ----------
  function apply(data, { replace } = {}) {
    if (!data || !Array.isArray(data.stations)) return 0;
    const local = A.store.get('stations', []);
    const incomingIds = new Set(data.stations.map(s => s.id));
    let list = replace ? local.filter(s => !s.synced || incomingIds.has(s.id)) : local.slice();
    // stations deleted on another device: they were synced before but aren't in the file anymore
    if (replace) local.filter(s => s.synced && !incomingIds.has(s.id)).forEach(s => { E.removeStation(s.id); A.removeMarker(s.id); });
    for (const st of data.stations) {
      const i = list.findIndex(s => s.id === st.id);
      const copy = { ...st, synced: !!replace };
      if (i >= 0) list[i] = copy; else list.push(copy);
      try { const live = E.addStation({ ...copy, freq: String(copy.freq).includes('FM') ? copy.freq : copy.freq + ' FM', gold: [] }); A.addMarker(live); } catch { /* skip broken entry */ }
    }
    A.store.set('stations', list, true);
    if (Array.isArray(data.songs)) {
      const have = new Set(E.custom.songs.map(s => s.station + s.id));
      data.songs.forEach(s => { if (!have.has(s.station + s.id)) E.custom.songs.push({ ...s, pub: !!replace }); else if (replace) { const m = E.custom.songs.find(x => x.station + x.id === s.station + s.id); if (m) m.pub = true; } });
      A.store.set('custom', E.custom.songs, true);
    }
    window.RadioLive?.clearCache();
    A.renderDial();
    return data.stations.length;
  }

  // ---------- load the published file on every visit ----------
  async function loadPublished() {
    try {
      const r = await fetch(FILE + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      const n = apply(data, { replace: true });
      if (n && location.hash.startsWith('#station-c-')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch { /* no file yet, or offline */ }
  }

  // ---------- publish to GitHub ----------
  let pending = null, busy = false;
  function schedulePublish() { if (!connected()) return; clearTimeout(pending); pending = setTimeout(publish, 1200); }
  async function gh(path, opts = {}) {
    const c = cfg();
    const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`, {
      ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
    return r;
  }
  async function publish(manual) {
    if (!connected() || busy) return false;
    busy = true;
    try {
      const c = cfg();
      const branch = c.branch || 'main';
      const head = await gh(`contents/${FILE}?ref=${branch}`);
      const sha = head.ok ? (await head.json()).sha : undefined;
      // mark everything we publish as synced
      A.store.set('stations', A.store.get('stations', []).map(s => ({ ...s, synced: true })), true);
      const body = { message: 'Update stations from Frequency Atlas', content: b64(JSON.stringify(payload(), null, 1)), branch, ...(sha ? { sha } : {}) };
      const put = await gh(`contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) });
      if (!put.ok) throw new Error((await put.json().catch(() => ({}))).message || put.status);
      A.store.set('lastSync', new Date().toISOString(), true);
      A.toast(manual ? 'Synced. Live on your other devices in about a minute.' : 'Saved to all your devices');
      return true;
    } catch (e) {
      A.toast('Sync failed: ' + String(e.message || e).slice(0, 80));
      return false;
    } finally { busy = false; renderIfOpen(); }
  }

  // every time stations or added songs change, publish (if connected)
  const origSet = A.store.set;
  A.store.set = (k, v, quiet) => { origSet(k, v); if (!quiet && (k === 'stations' || k === 'custom')) schedulePublish(); };

  // ---------- sync link (no account needed) ----------
  function syncLink() {
    const data = { stations: A.store.get('stations', []).map(({ synced, ...s }) => s), songs: E.custom.songs };
    return location.origin + location.pathname + '#import-' + b64(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function handleImport() {
    if (!location.hash.startsWith('#import-')) return;
    try {
      const raw = location.hash.slice(8).replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(unb64(raw + '==='.slice((raw.length + 3) % 4)));
      const n = apply(data);
      A.store.set('stations', A.store.get('stations', []));   // save locally (and publish if connected)
      A.toast(`Added ${n} station${n === 1 ? '' : 's'} to this browser`);
    } catch { A.toast("That sync link didn't work. Copy it again."); }
    history.replaceState(null, '', location.pathname);
    A.go('');
  }

  // ---------- settings panel ----------
  function renderIfOpen() { if (location.hash === '#sync') render(); }
  function render() {
    const c = cfg() || { ...guessRepo(), branch: 'main', token: '' };
    const p = $('#panel'); p.hidden = false; p.style.setProperty('--c', '#2ee6c8');
    const last = A.store.get('lastSync', null);
    const mine = A.store.get('stations', []);
    $('#panelBody').innerHTML = `
      <div class="hero" style="--c:#2ee6c8"><div class="hero-top"><div class="logo">⇄<small>SYNC</small></div>
        <div><h2>Sync your stations</h2><div class="sub"><b>${connected() ? 'Connected' : 'Not connected'}</b> · ${mine.length} station${mine.length === 1 ? '' : 's'} you built</div></div></div><div style="height:16px"></div></div>
      <div class="tabpane builder">
        <div class="sec"><h3>Automatic (recommended)</h3>
          <p>Connect this browser to your GitHub repo once. Every station you build, edit or delete is saved to <code>stations.json</code> in the repo, and every device that opens your site loads it, including people you share the link with.</p></div>
        <div class="grid2">
          <label class="fld"><span>GitHub username</span><input id="sOwner" value="${esc(c.owner)}" autocomplete="off"></label>
          <label class="fld"><span>Repository</span><input id="sRepo" value="${esc(c.repo)}" autocomplete="off"></label>
        </div>
        <label class="fld"><span>Access token (stays in this browser only)</span><input id="sToken" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
        <p class="lead" style="font-size:13px">Make one at github.com → Settings → Developer settings → Fine-grained tokens → <b>Generate new token</b>. Repository access: <b>Only select repositories</b> → your Frequency Atlas repo. Permissions: <b>Contents → Read and write</b>. Do this on each device you build stations from. Devices that only listen don't need it.</p>
        <div class="bactions">
          <button class="btn btn-main" id="sConnect">${connected() ? 'Save & sync now' : 'Connect'}</button>
          ${connected() ? '<button class="btn btn-ghost" id="sOff">Disconnect this browser</button>' : ''}
        </div>
        <p class="hint" id="sMsg" role="status">${last ? 'Last synced ' + new Date(last).toLocaleString() : ''}</p>

        <div class="sec" style="margin-top:26px"><h3>Quick move (no account)</h3>
          <p>Copy a link that carries your stations, then open it on your phone or another browser to add them there. This copies once; it doesn't keep syncing.</p></div>
        <div class="bactions"><button class="btn btn-ghost" id="sLink" ${mine.length ? '' : 'disabled'}>Copy sync link</button></div>
      </div>`;
    $('#sConnect').addEventListener('click', connect);
    $('#sOff')?.addEventListener('click', () => { A.store.set('sync', null, true); A.toast('This browser is disconnected'); render(); });
    $('#sLink').addEventListener('click', () => navigator.clipboard?.writeText(syncLink()).then(() => A.toast('Sync link copied. Open it on your other device.'), () => A.toast('Copy failed')));
  }
  async function connect() {
    const c = { owner: $('#sOwner').value.trim(), repo: $('#sRepo').value.trim(), token: $('#sToken').value.trim(), branch: 'main' };
    if (!c.owner || !c.repo || !c.token) { $('#sMsg').textContent = 'Fill in all three fields.'; return; }
    $('#sMsg').textContent = 'Checking…';
    A.store.set('sync', c, true);
    try {
      const r = await gh('');
      if (!r.ok) throw new Error(r.status === 404 ? "can't see that repo with this token" : r.status === 401 ? 'token not accepted' : 'GitHub said ' + r.status);
      const repo = await r.json();
      if (!repo.permissions?.push) throw new Error('this token can read the repo but not write to it. Give it Contents: Read and write');
      c.branch = repo.default_branch || 'main'; A.store.set('sync', c, true);
      // pull what's already published first, so nothing gets overwritten
      const f = await gh(`contents/${FILE}?ref=${c.branch}`);
      if (f.ok) { const j = await f.json(); apply(JSON.parse(unb64(j.content.replace(/\n/g, '')))); }
      await publish(true);
    } catch (e) {
      $('#sMsg').textContent = 'Not connected: ' + (e.message || e) + '.';
      A.store.set('sync', null, true);
    }
  }

  // routing for #sync and #import-
  window.addEventListener('hashchange', () => { if (location.hash === '#sync') render(); else if (location.hash.startsWith('#import-')) handleImport(); });
  window.RadioSync = { publish, render, connected };
  if (location.hash === '#sync') render();
  handleImport();
  loadPublished();
}
