/* Frequency Atlas — full-song players.
   YouTube: free for everyone, no sign-in (official audio/video uploads; ads possible; must stay on screen).
   Apple Music: MusicKit JS (needs an Apple Music subscription and the site owner's Apple Developer key).
   Spotify: Premium. On computers it plays right in the page (Web Playback SDK); on phones it plays
            through the listener's Spotify app (Spotify Connect), which keeps going with the screen locked.
   A song with no full version available falls back to the 30-second Spotify preview. */
{
  const A = window.RadioApp, E = window.RadioEngine;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = A.esc, store = A.store;
  // site settings come from config.js; the site-setup box below can override them in this browser for testing
  const CFG = Object.assign({ appName: 'Frequency Atlas', appleStorefront: 'us' }, window.RADIO_CONFIG || {}, store.get('musicCfg', {}));
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  let source = store.get('source', 'preview');      // 'apple' | 'spotify' | 'preview'
  const api = window.RadioAccounts = { held: false, active: () => null };

  function loadScript(src, attrs = {}) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
      s.onload = res; s.onerror = () => rej(new Error('could not load ' + src));
      document.head.appendChild(s);
    });
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').replace(/\b(feat|ft|with)\b.*$/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  const firstArtist = (a) => String(a || '').split(/,|&| x | feat\.?| ft\.?| with /i)[0].trim();

  // ======================= Apple Music =======================
  const apple = {
    id: 'apple', name: 'Apple Music', music: null, ready: null, current: null, endedFor: null,
    ids: store.get('amIds', {}),
    configured: () => !!CFG.appleDeveloperToken,
    signedIn() { return !!this.music?.isAuthorized; },
    init() {
      if (this.ready) return this.ready;
      this.ready = (async () => {
        if (!window.MusicKit) {
          await new Promise((res, rej) => {
            document.addEventListener('musickitloaded', res, { once: true });
            loadScript('https://js-cdn.music.apple.com/musickit/v3/musickit.js', { 'data-web-components': '' }).catch(rej);
            setTimeout(() => rej(new Error('Apple Music took too long to load')), 20000);
          });
        }
        await MusicKit.configure({ developerToken: CFG.appleDeveloperToken, app: { name: CFG.appName, build: '1.0' } });
        const m = this.music = MusicKit.getInstance();
        m.addEventListener('playbackStateDidChange', ({ state }) => {
          const S = MusicKit.PlaybackStates;
          if (state === S.completed || state === S.ended) this.ended();
        });
        m.addEventListener('playbackTimeDidChange', () => {
          A.liveCheck();
          const d = m.currentPlaybackDuration, t = m.currentPlaybackTime;
          if (d > 35 && t >= d - 1.2) this.ended();
        });
        m.addEventListener('authorizationStatusDidChange', refreshUI);
        return m;
      })();
      this.ready.catch(() => { this.ready = null; });
      return this.ready;
    },
    ended() { if (!this.current || this.endedFor === this.current) return; this.endedFor = this.current; A.onEnded(); },
    async signIn() {
      const m = await this.init();
      await m.authorize();
      if (m.isAuthorized) { setSource('apple'); A.toast('Signed in to Apple Music. Full songs on.'); }
    },
    async signOut() { try { await this.music?.unauthorize(); } catch { /* already signed out */ } if (source === 'apple') setSource('preview'); },
    // match a song from the station's library to the Apple Music catalog (cached in this browser)
    async find(song) {
      if (this.ids[song.id] !== undefined) return this.ids[song.id];
      const m = this.music, t = norm(song.title), a = norm(firstArtist(song.artist));
      let hit = null;
      try {
        const r = await m.api.music(`/v1/catalog/${CFG.appleStorefront}/search`, { term: `${song.title} ${firstArtist(song.artist)}`.slice(0, 120), types: 'songs', limit: 10 });
        const list = r?.data?.results?.songs?.data || [];
        const scored = list.map(s => {
          const st = norm(s.attributes.name), sa = norm(s.attributes.artistName);
          const artistOk = a && sa && (sa.includes(a) || a.includes(sa));
          const titleOk = st === t ? 2 : (st.startsWith(t) || t.startsWith(st)) ? 1 : 0;
          return { s, score: (artistOk ? 2 : 0) + titleOk };
        }).filter(x => x.score >= 3).sort((x, y) => y.score - x.score);
        if (scored[0]) hit = { id: scored[0].s.id, ms: scored[0].s.attributes.durationInMillis || 0 };
      } catch { return null; }      // network trouble: try again next time
      this.ids[song.id] = hit; store.set('amIds', this.ids);
      return hit;
    },
    async play(song, seekSec) {
      const m = await this.init().catch(() => null);
      if (!m || !m.isAuthorized) return false;
      this.current = song; this.endedFor = null;
      const hit = await this.find(song);
      if (A.current() !== song) return true;               // listener moved on while we searched
      if (!hit) { A.toast(`“${song.title}” isn't on Apple Music. Playing a preview.`); this.current = null; return false; }
      try {
        await m.setQueue({ song: hit.id, startPlaying: true });
        await m.play();
        if (seekSec > 2) await m.seekToTime(hit.ms ? Math.min(seekSec, hit.ms / 1000 - 3) : seekSec);
        return true;
      } catch (e) {
        this.current = null;
        A.toast(/autoplay|gesture|NotAllowed/i.test(String(e)) ? 'Tap ▶ to start Apple Music' : 'Apple Music could not play that song. Playing a preview.');
        return false;
      }
    },
    pause() { try { this.music?.pause(); } catch { /* not playing */ } },
    resume() { try { this.music?.play(); } catch { /* nothing queued */ } },
    duck(on) { try { this.music.volume = on ? 0.2 : 1; } catch { /* not ready */ } },
    align(sec) { try { const t = this.music.currentPlaybackTime; if (sec - t > 3) this.music.seekToTime(sec); } catch { /* not ready */ } },
    isPaused() { return !this.music || this.music.playbackState !== MusicKit.PlaybackStates.playing; },
  };

  // ======================= Spotify (Premium, computers) =======================
  const SP_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
  const redirectUri = () => location.origin + location.pathname;
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const spotify = {
    id: 'spotify', name: 'Spotify', tok: store.get('spTok', null), player: null, ready: null, device: null,
    current: null, endedFor: null, wasPlaying: false, lastPos: 0, dur: 0,
    connect: isMobile,                // phones: drive the listener's Spotify app instead of an in-page player
    remote: null, lastPoll: 0,        // last known state of the Spotify app
    configured: () => !!CFG.spotifyClientId,
    signedIn() { return !!this.tok?.refresh; },
    async signIn() {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const stateTag = b64url(crypto.getRandomValues(new Uint8Array(12)));
      sessionStorage.setItem('fa:spPkce', JSON.stringify({ verifier, stateTag, back: location.hash || '#account' }));
      const q = new URLSearchParams({ response_type: 'code', client_id: CFG.spotifyClientId, scope: SP_SCOPES, redirect_uri: redirectUri(),
        code_challenge_method: 'S256', code_challenge: challenge, state: stateTag });
      location.assign('https://accounts.spotify.com/authorize?' + q);
    },
    async finishSignIn(code, stateTag) {
      const saved = JSON.parse(sessionStorage.getItem('fa:spPkce') || 'null'); sessionStorage.removeItem('fa:spPkce');
      if (!saved || saved.stateTag !== stateTag) throw new Error('sign-in expired, try again');
      await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: CFG.spotifyClientId, code_verifier: saved.verifier });
      return saved.back;
    },
    async tokenRequest(body) {
      const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error_description || j.error || 'Spotify said ' + r.status);
      this.tok = { access: j.access_token, refresh: j.refresh_token || this.tok?.refresh, exp: Date.now() + j.expires_in * 1000 };
      store.set('spTok', this.tok);
      return this.tok.access;
    },
    async token() {
      if (!this.tok) return null;
      if (Date.now() < this.tok.exp - 60000) return this.tok.access;
      try { return await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tok.refresh, client_id: CFG.spotifyClientId }); }
      catch { this.signOut(); A.toast('Spotify signed you out. Sign in again for full songs.'); return null; }
    },
    signOut() { this.tok = null; store.set('spTok', null); try { this.player?.disconnect(); } catch { /* gone */ } this.player = null; this.ready = null; this.device = null; if (source === 'spotify') setSource('preview'); },
    init() {
      if (this.ready) return this.ready;
      this.ready = (async () => {
        if (!window.Spotify?.Player) {
          await new Promise((res, rej) => {
            window.onSpotifyWebPlaybackSDKReady = res;
            loadScript('https://sdk.scdn.co/spotify-player.js').catch(rej);
            setTimeout(() => rej(new Error('Spotify took too long to load')), 20000);
          });
        }
        const p = this.player = new Spotify.Player({ name: CFG.appName + ' (web)', volume: 0.85, getOAuthToken: cb => this.token().then(t => t && cb(t)) });
        const device = await new Promise((res, rej) => {
          p.addListener('ready', ({ device_id }) => res(device_id));
          p.addListener('initialization_error', ({ message }) => rej(new Error(message)));
          p.addListener('authentication_error', ({ message }) => rej(new Error(message)));
          p.addListener('account_error', () => rej(new Error('Spotify Premium is needed for full songs')));
          p.connect();
          setTimeout(() => rej(new Error('Spotify player did not start')), 15000);
        });
        p.addListener('player_state_changed', () => A.liveCheck());
        this.device = device;
        return p;
      })();
      this.ready.catch((e) => { this.ready = null; A.toast(String(e.message || e)); });
      return this.ready;
    },
    async api(method, pathQ, body) {
      const t = await this.token(); if (!t) return null;
      return fetch('https://api.spotify.com/v1' + pathQ, { method, headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    },
    // phones: find the listener's Spotify app
    async phoneDevice() {
      const r = await this.api('GET', '/me/player/devices'); if (!r?.ok) return null;
      const list = (await r.json()).devices || [];
      return list.find(d => d.is_active && !d.is_restricted) || list.find(d => d.type === 'Smartphone' && !d.is_restricted) || list.find(d => !d.is_restricted) || null;
    },
    openApp() { location.href = 'spotify:'; },
    // called by the background-safe clock: notice when the song finishes
    async poll() {
      if (this.connect) return this.pollRemote();
      if (!this.current || !this.player || source !== 'spotify') return;
      const s = await this.player.getCurrentState().catch(() => null); if (!s) return;
      if (!s.paused) { this.wasPlaying = true; this.lastPos = s.position; this.dur = s.duration; }
      const nearEnd = !s.paused && s.duration > 35000 && s.position >= s.duration - 1200;
      const reset = s.paused && this.wasPlaying && s.position === 0 && this.lastPos >= this.dur - 3000;
      if ((nearEnd || reset) && this.endedFor !== this.current) { this.endedFor = this.current; this.wasPlaying = false; A.onEnded(); }
    },
    async pollRemote() {
      if (!this.current || source !== 'spotify' || document.hidden || Date.now() - this.lastPoll < 3000) return;
      this.lastPoll = Date.now();
      const r = await this.api('GET', '/me/player'); if (!r || r.status === 204 || !r.ok) return;
      const s = await r.json(); const id = s.item?.id, cur = this.current;
      this.remote = { id, pos: s.progress_ms, playing: s.is_playing, at: Date.now() };
      A.liveCheck();
      if (!cur || this.endedFor === cur) return;
      if (id === cur.id) { if (s.is_playing) { this.wasPlaying = true; this.lastPos = s.progress_ms; this.dur = s.item.duration_ms; } }
      // the app moved past our song (it plays the queued schedule on its own), or stopped at the end
      const movedOn = this.wasPlaying && id && id !== cur.id && !s.item?.linked_from;
      const stopped = this.wasPlaying && !s.is_playing && this.lastPos >= this.dur - 6000;
      if (movedOn || stopped) { this.endedFor = cur; this.wasPlaying = false; A.onEnded(); }
    },
    // phones: tell the Spotify app to play this song plus what's scheduled after it,
    // so the radio keeps going even when the browser is in the background
    async playRemote(song, seekSec) {
      const pos = Math.max(0, Math.round((seekSec || 0) * 1000));
      const rm = this.remote;
      if (rm && rm.id === song.id && rm.playing && Math.abs(rm.pos + (Date.now() - rm.at) - pos) < 6000) { this.current = song; return true; }  // already there
      this.current = song; this.endedFor = null; this.wasPlaying = false; this.lastPos = 0;
      const uris = [song.id, ...A.upNext(14).filter(id => id !== song.id)].map(id => 'spotify:track:' + id);
      const dev = await this.phoneDevice();
      let r = await this.api('PUT', '/me/player/play' + (dev ? '?device_id=' + encodeURIComponent(dev.id) : ''), { uris, position_ms: pos });
      if (r && (r.ok || r.status === 202 || r.status === 204)) { this.remote = { id: song.id, pos, playing: true, at: Date.now() }; return true; }
      this.current = null;
      if (r?.status === 404 || !dev) A.toast('Open the Spotify app once (then come back) so the radio can play there.', 'Open Spotify', () => this.openApp());
      else if (r?.status === 403) A.toast("Spotify blocked this account. It needs Premium and must be on the app's user list.");
      else A.toast('Spotify could not play that song. Playing a preview.');
      return false;
    },
    async play(song, seekSec) {
      if (this.connect) return this.playRemote(song, seekSec);
      const p = await this.init().catch(() => null); if (!p) return false;
      const t = await this.token(); if (!t) return false;
      this.current = song; this.endedFor = null; this.wasPlaying = false; this.lastPos = 0;
      try { p.activateElement?.(); } catch { /* not needed on this browser */ }
      const r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.device)}`, {
        method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: ['spotify:track:' + song.id], position_ms: Math.max(0, Math.round((seekSec || 0) * 1000)) }),
      }).catch(() => null);
      if (r && (r.ok || r.status === 202 || r.status === 204)) return true;
      this.current = null;
      if (r?.status === 403) A.toast("Spotify blocked this account. It needs Premium and must be on the app's user list.");
      else A.toast('Spotify could not play that song. Playing a preview.');
      return false;
    },
    pause() {
      if (this.connect) { if (this.remote?.playing) { this.remote.playing = false; this.api('PUT', '/me/player/pause'); } return; }
      this.player?.pause().catch(() => {});
    },
    resume() { if (this.connect) this.api('PUT', '/me/player/play'); else this.player?.resume().catch(() => {}); },
    duck(on) { if (!this.connect) this.player?.setVolume(on ? 0.18 : 0.85).catch(() => {}); },
    align(sec) {
      if (this.connect) return;
      this.player?.getCurrentState().then(s => { if (s && sec * 1000 - s.position > 3000) this.player.seek(Math.round(sec * 1000)); }).catch(() => {});
    },
  };

  // ======================= YouTube (free) =======================
  const ytNorm = norm;
  const youtube = {
    id: 'youtube', name: 'YouTube', player: null, ready: null, current: null, endedFor: null, box: null,
    ids: Object.assign({}, window.RADIO_YT?.ids || {}, store.get('ytIds', {})),
    enabled: () => store.get('ytOn', true),
    configured: () => true,
    signedIn: () => true,
    init() {
      if (this.ready) return this.ready;
      this.ready = (async () => {
        const box = this.box = document.createElement('div'); box.className = 'ytbox'; box.hidden = true;
        box.innerHTML = '<div id="ytFrame"></div>'; document.body.appendChild(box);
        if (!window.YT?.Player) {
          await new Promise((res, rej) => {
            const prevCb = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prevCb?.(); res(); };
            loadScript('https://www.youtube.com/iframe_api').catch(rej);
            setTimeout(() => rej(new Error('YouTube took too long to load')), 20000);
          });
        }
        return new Promise((res) => {
          this.player = new YT.Player('ytFrame', {
            width: '100%', height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, origin: location.origin },
            events: {
              onReady: () => res(this.player),
              onStateChange: (e) => {
                A.liveCheck();
                if (e.data === YT.PlayerState.ENDED) this.ended();
                if (e.data === YT.PlayerState.PLAYING) this.tapHint = false;
              },
              onError: () => {                 // removed or not allowed to embed: forget it and play the preview
                const s = this.current; if (!s) return;
                this.ids[s.id] = ''; store.set('ytIds', this.local());
                this.current = null; this.hide(); A.previewPlay(s);
              },
            },
          });
        });
      })();
      this.ready.catch(() => { this.ready = null; });
      return this.ready;
    },
    local() { const base = window.RADIO_YT?.ids || {}; return Object.fromEntries(Object.entries(this.ids).filter(([k, v]) => base[k] !== v)); },
    ended() { if (!this.current || this.endedFor === this.current) return; this.endedFor = this.current; A.onEnded(); },
    tick() {
      if (!this.current || !this.player?.getCurrentTime) return;
      const d = this.player.getDuration?.() || 0, t = this.player.getCurrentTime();
      if (d > 35 && t >= d - 1.2) this.ended();
    },
    // songs the daily GitHub job hasn't matched yet can be looked up here if the site has a YouTube key
    async find(song) {
      if (this.ids[song.id] !== undefined) return this.ids[song.id] || null;
      if (!CFG.youtubeApiKey) return null;
      const q = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', videoEmbeddable: 'true', regionCode: 'US', q: `${song.title} ${firstArtist(song.artist)}`, key: CFG.youtubeApiKey });
      const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + q).catch(() => null);
      if (!r?.ok) return null;                                  // quota or network: try another day
      const items = (await r.json()).items || [];
      const t = ytNorm(song.title), a = ytNorm(firstArtist(song.artist));
      const dec = (x) => { const el = document.createElement('textarea'); el.innerHTML = x; return el.value; };
      const best = items.map(it => {
        const title = dec(it.snippet.title), ch = dec(it.snippet.channelTitle);
        const full = title.toLowerCase().replace(/[^a-z0-9]+/g, ''), cn = ytNorm(ch.replace(/ - Topic$/, ''));
        const titleOk = ytNorm(title.replace(/^.*? - /, '')) === t || full.includes(t);
        const artistOk = a && cn && (cn.includes(a) || a.includes(cn) || full.includes(a));
        let score = (/ - Topic$/.test(ch) && artistOk) ? 6 : (/vevo$/i.test(ch) || artistOk) ? 4 : 0;
        if (titleOk) score += 3;
        if (/\b(live|cover|karaoke|lyrics?|sped ?up|slowed|remix|instrumental|nightcore)\b/i.test(title) && !/remix|live/i.test(song.title)) score -= 6;
        return { id: it.id.videoId, ok: titleOk && artistOk && score >= 6, score };
      }).filter(x => x.ok).sort((x, y) => y.score - x.score)[0];
      this.ids[song.id] = best?.id || ''; store.set('ytIds', this.local());
      return best?.id || null;
    },
    show() { if (this.box) this.box.hidden = false; document.body.classList.add('yt-on'); },
    hide() { if (this.box) this.box.hidden = true; document.body.classList.remove('yt-on'); },
    async play(song, seekSec) {
      if (!this.enabled()) return false;
      const vid = await this.find(song);
      if (!vid) return false;
      const p = await this.init().catch(() => null); if (!p) return false;
      if (A.current() !== song) return true;
      this.current = song; this.endedFor = null;
      this.show();
      p.loadVideoById({ videoId: vid, startSeconds: Math.max(0, Math.floor(seekSec || 0)) });
      // phones often need one tap on the video the first time
      setTimeout(() => { if (this.current === song && p.getPlayerState?.() !== YT.PlayerState.PLAYING && !this.hinted) { this.hinted = true; A.toast('Tap the video to start'); } }, 2500);
      return true;
    },
    pause() { try { this.player?.pauseVideo(); } catch { /* not ready */ } },
    resume() { try { this.player?.playVideo(); } catch { /* not ready */ } },
    duck(on) { try { this.player?.setVolume(on ? 18 : 100); } catch { /* not ready */ } },
    // only ever jump forward: a song started early under an ID just keeps going
    align(sec) { try { const t = this.player.getCurrentTime(); if (sec - t > 3) this.player.seekTo(sec, true); } catch { /* not ready */ } },
  };
  window.RadioClock.onTick(() => youtube.tick());
  window.RadioClock.onTick(() => spotify.poll());

  // ======================= which one plays =======================
  function active() {
    if (source === 'apple' && apple.configured() && apple.signedIn()) return apple;
    if (source === 'spotify' && spotify.configured() && spotify.signedIn()) return spotify;
    if (youtube.enabled()) return youtube;
    return null;
  }
  const signedInPlayer = () => { const p = active(); return p && p !== youtube ? p : null; };
  function setSource(s) {
    const before = active();
    source = s; store.set('source', s);
    if (before && before !== active()) { before.pause(); if (before === youtube) youtube.hide(); }
    api.held = false;
    refreshUI();
    A.replay();         // pick up the current song with the new player
  }

  // header button and player badge
  const nav = document.querySelector('.topnav');
  const btn = document.createElement('a'); btn.className = 'pill'; btn.id = 'btnAccount'; btn.href = '#account';
  nav.insertBefore(btn, nav.querySelector('#btnBuild'));
  const badge = document.createElement('span'); badge.className = 'player-src'; badge.id = 'plSrc';
  $('.player-meta').appendChild(badge);
  const pauseBtn = document.createElement('button'); pauseBtn.className = 'ctrl'; pauseBtn.id = 'plPause'; pauseBtn.hidden = true;
  pauseBtn.textContent = '⏯'; pauseBtn.title = 'Play / pause'; pauseBtn.setAttribute('aria-label', 'Play or pause');
  $('.player-ctrls').prepend(pauseBtn);
  pauseBtn.addEventListener('click', () => {
    const p = active(); if (!p) return;
    api.held = !api.held;
    if (api.held) p.pause(); else if (A.isLive()) A.replay(); else p.resume();   // live radio rejoins where everyone is
    pauseBtn.setAttribute('aria-pressed', String(!api.held));
  });

  function setBadge() {
    const p = active();
    badge.textContent = p === spotify && spotify.connect ? 'Full songs · in your Spotify app' : p ? 'Full songs · ' + p.name : 'Previews · Sign in for full songs';
  }
  function refreshUI() {
    const p = active(), signed = signedInPlayer();
    btn.textContent = signed ? '♪ ' + signed.name : 'Sign in';
    btn.classList.toggle('on', !!signed);
    $('#player').classList.toggle('ext', !!p);
    setBadge();
    pauseBtn.hidden = !p;
    if (p !== youtube) youtube.hide();
    if (location.hash === '#account') render();
  }

  // ======================= panel =======================
  function card(p, desc, signedIn, extra = '') {
    const on = active() === p;
    let action;
    if (!p.configured()) action = `<p class="hint">Not set up on this site yet. See “Site setup” below.</p>`;
    else if (signedIn) action = `<div class="bactions">
        ${on ? '<span class="chip on">Playing full songs</span>' : `<button class="btn btn-main" data-use="${p.id}">Use ${p.name}</button>`}
        <button class="btn btn-ghost" data-out="${p.id}">Sign out</button></div>`;
    else action = `<div class="bactions"><button class="btn btn-main" data-in="${p.id}">Sign in with ${p.name}</button></div>`;
    return `<div class="acct ${on ? 'on' : ''}"><h3>${p.name}${signedIn ? ' <small>signed in</small>' : ''}</h3><p>${desc}</p>${extra}${action}</div>`;
  }
  function render() {
    const panel = $('#panel'); panel.hidden = false; panel.style.setProperty('--c', '#ff4f8b');
    const p = active();
    $('#panelBody').innerHTML = `
      <div class="hero" style="--c:#ff4f8b"><div class="hero-top"><div class="logo">♪<small>SIGN IN</small></div>
        <div><h2>Full songs</h2><div class="sub">${p ? `<b>Playing through ${p.name}</b>` : 'Right now you hear 30-second previews'}</div></div></div><div style="height:16px"></div></div>
      <div class="tabpane builder">
        <p class="lead">Sign in with a music account to hear every station's songs in full, in sync with everyone else listening.</p>
        ${apple.configured() ? card(apple, 'Needs an Apple Music subscription. Works on phones and computers.', apple.signedIn()) : ''}
        ${card(spotify, isMobile ? 'Needs Spotify Premium. On your phone the radio plays through your Spotify app, so it keeps going with the screen locked.' : 'Needs Spotify Premium. Plays right here in the browser.', spotify.signedIn(),
          isMobile && spotify.signedIn() ? '<div class="bactions" style="margin-bottom:10px"><button class="btn btn-ghost" id="spOpen">Open the Spotify app</button></div><p class="hint">If nothing plays, open the Spotify app once, then come back here.</p>' : '')}
        ${p && p !== youtube ? `<div class="bactions"><button class="btn btn-ghost" data-use="preview">Stop using ${p.name}</button></div>` : ''}
        <div class="acct ${p === youtube ? 'on' : ''}"><h3>YouTube <small>free</small></h3>
          <p>No account needed. Plays the official audio or video, with occasional YouTube ads. Keep the video on screen; it stops if your phone locks. Songs not matched yet play a preview.</p>
          <label class="tgl"><input type="checkbox" id="ytOn" ${youtube.enabled() ? 'checked' : ''}> Use YouTube when not signed in</label></div>
        <details class="setup"><summary>Site setup (for the site owner)</summary>
          <p><b>Apple Music:</b> needs an Apple Developer membership. Make a MusicKit key, then run <code>node scripts/apple-token.mjs AuthKey_XXXX.p8 TEAMID KEYID</code> and paste the token into <code>config.js</code>. Tokens last up to 6 months.</p>
          <p><b>Spotify:</b> create an app at developer.spotify.com/dashboard, tick <b>Web Playback SDK</b> and <b>Web API</b>, and add this address as a Redirect URI:</p>
          <p><code>${esc(redirectUri())}</code></p>
          <p>Copy the Client ID into <code>config.js</code>. Spotify lets a personal app have <b>up to 5 listeners</b>, and you add each one's Spotify email under <b>User Management</b>.</p>
          <p><b>YouTube:</b> free. Make an API key (README → “YouTube player”) and save it as the repo secret <code>YOUTUBE_API_KEY</code>; a daily job matches about 95 songs a day. Optionally put a website-restricted key in <code>config.js</code> → <code>youtubeApiKey</code> so missing songs are looked up on the spot.</p>
          <p class="hint">To test before uploading, paste values here. They're saved in this browser only.</p>
          <label class="fld"><span>Spotify Client ID</span><input id="cfSp" value="${esc(CFG.spotifyClientId || '')}" autocomplete="off"></label>
          <label class="fld"><span>Apple Music developer token</span><input id="cfAm" type="password" value="${esc(CFG.appleDeveloperToken || '')}" autocomplete="off"></label>
          <label class="fld"><span>YouTube API key</span><input id="cfYt" type="password" value="${esc(CFG.youtubeApiKey || '')}" autocomplete="off"></label>
          <div class="bactions"><button class="btn btn-ghost" id="cfSave">Save in this browser</button></div>
        </details>
      </div>`;
    const P = { apple, spotify };
    $('#panelBody').querySelectorAll('[data-in]').forEach(b => b.addEventListener('click', async () => {
      try { await P[b.dataset.in].signIn(); } catch (e) { A.toast('Sign-in failed: ' + (e.message || e)); }
      refreshUI();
    }));
    $('#panelBody').querySelectorAll('[data-out]').forEach(b => b.addEventListener('click', async () => { await P[b.dataset.out].signOut(); refreshUI(); }));
    $('#panelBody').querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => { if (b.dataset.use === 'spotify' && !spotify.connect) spotify.init(); setSource(b.dataset.use); }));
    $('#ytOn').addEventListener('change', (e) => { store.set('ytOn', e.target.checked); setSource(source); });
    $('#spOpen')?.addEventListener('click', () => spotify.openApp());
    $('#cfSave').addEventListener('click', () => {
      const v = { spotifyClientId: $('#cfSp').value.trim(), appleDeveloperToken: $('#cfAm').value.trim(), youtubeApiKey: $('#cfYt').value.trim() };
      store.set('musicCfg', v); Object.assign(CFG, v); apple.ready = null;
      A.toast('Saved in this browser'); render();
    });
  }

  // ======================= start-up =======================
  window.addEventListener('hashchange', () => { if (location.hash === '#account') render(); });
  // coming back from Spotify's sign-in page
  const q = new URLSearchParams(location.search);
  if (q.get('code') && q.get('state')) {
    history.replaceState(null, '', location.pathname);
    spotify.finishSignIn(q.get('code'), q.get('state'))
      .then((back) => { setSource('spotify'); A.toast(isMobile ? 'Signed in. The radio will play in your Spotify app.' : 'Signed in to Spotify. Full songs on.'); A.go(back.slice(1)); })
      .catch((e) => { A.toast('Spotify sign-in failed: ' + (e.message || e)); A.go('account'); });
  } else if (q.get('error')) { history.replaceState(null, '', location.pathname); A.toast('Spotify sign-in was cancelled'); }
  if (apple.configured() && source === 'apple') apple.init().then(refreshUI, () => {});
  if (youtube.enabled() && !signedInPlayer()) youtube.init().catch(() => {});   // load early so the first tap plays right away
  refreshUI();
  if (location.hash === '#account') render();

  Object.assign(api, { active, render, apple, spotify, youtube, badge: setBadge });
}
