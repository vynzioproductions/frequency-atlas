/* A clock that keeps ticking in background tabs. Browsers slow or freeze page timers when a tab
   is hidden, but timers inside a Web Worker keep running, so the worker sends a tick every
   half second and the page uses those ticks to start the next song on time. */
{
  const listeners = new Set();
  const waits = [];
  let worker = null;
  try {
    const src = 'setInterval(() => postMessage(Date.now()), 500);';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => tick();
  } catch { /* no workers: fall back to a normal interval */ setInterval(tick, 500); }
  function tick() {
    const now = Date.now();
    for (let i = waits.length - 1; i >= 0; i--) if (now >= waits[i].at) { const w = waits.splice(i, 1)[0]; w.resolve(); }
    listeners.forEach(fn => { try { fn(now); } catch { /* keep ticking */ } });
  }
  // like setTimeout, but survives background tabs (resolution: about half a second)
  function wait(ms) {
    return new Promise(resolve => {
      waits.push({ at: Date.now() + ms, resolve });
      if (ms < 500) setTimeout(() => { const i = waits.findIndex(w => w.resolve === resolve); if (i >= 0) { waits.splice(i, 1); resolve(); } }, ms);
    });
  }
  window.RadioClock = { wait, onTick: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
