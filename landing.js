// Landing page: shell colors, the handheld's buttons, and pressing start to enter the town.
(() => {
  const SHELLS = {
    lilac: { name: 'Lilac', shell: '#cdb8e6', on: '#2c2633' },
    berry: { name: 'Berry', shell: '#e0285f', on: '#2a0e18' },
    teal: { name: 'Teal', shell: '#1f86cc', on: '#08243a' },
    kiwi: { name: 'Kiwi', shell: '#a8d330', on: '#26330a' },
    dandelion: { name: 'Dandelion', shell: '#f8bd22', on: '#3a2a05' },
    grape: { name: 'Grape', shell: '#4b30b2', on: '#e9e3ff' },
    atomic: { name: 'Atomic purple', shell: '#8b63c9', on: '#1e1230' },
  };
  const order = Object.keys(SHELLS);
  const device = document.getElementById('device');
  const nameEl = document.getElementById('shell-name');
  const swatches = [...document.querySelectorAll('[data-shell]')];

  let current = 'lilac';
  try {
    const saved = localStorage.getItem('shell');
    if (SHELLS[saved]) current = saved;
  } catch {}

  function setShell(key) {
    current = key;
    const s = SHELLS[key];
    device.style.setProperty('--shell', s.shell);
    device.style.setProperty('--on', s.on);
    nameEl.textContent = s.name;
    swatches.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.shell === key)));
    try {
      localStorage.setItem('shell', key);
    } catch {}
  }
  swatches.forEach((b) => {
    b.style.setProperty('--sw', SHELLS[b.dataset.shell].shell);
    b.addEventListener('click', () => setShell(b.dataset.shell));
  });
  const step = (d) => setShell(order[(order.indexOf(current) + d + order.length) % order.length]);
  setShell(current);

  // ---------- live preview in the screen ----------
  const screen = device.querySelector('.screen');
  const live = device.querySelector('.screen-live');
  const fit = () => live.style.setProperty('--fit', String(screen.clientWidth / 640));
  new ResizeObserver(fit).observe(screen);
  fit();
  live.addEventListener('load', () => setTimeout(() => live.classList.add('ready'), 1200));

  // ---------- start ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let launching = false;
  function play() {
    if (launching) return;
    launching = true;
    if (reduced) {
      location.href = 'play.html';
      return;
    }
    device.classList.add('booting');
    // zoom so the screen fills the window, then hand over to the town
    setTimeout(() => {
      const r = screen.getBoundingClientRect();
      const d = device.getBoundingClientRect();
      const scale = Math.max(innerWidth / r.width, innerHeight / r.height) * 1.08;
      const ox = r.left + r.width / 2 - d.left;
      const oy = r.top + r.height / 2 - d.top;
      device.style.transformOrigin = `${ox}px ${oy}px`;
      device.style.transform = `translate(${innerWidth / 2 - (r.left + r.width / 2)}px, ${innerHeight / 2 - (r.top + r.height / 2)}px) scale(${scale})`;
      document.body.classList.add('launching');
    }, 900);
    setTimeout(() => (location.href = 'play.html'), 2000);
  }
  // coming back with the browser's back button restores a usable page
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    launching = false;
    device.classList.remove('booting');
    device.style.transform = '';
    document.body.classList.remove('launching');
  });

  document.getElementById('start').addEventListener('click', play);
  device.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'play') play();
      else step(act === 'next' ? 1 : -1);
    }),
  );

  // keyboard: Enter / A start, arrows or S cycle colors (only when not typing or focused on a link)
  const press = (sel) => {
    const el = device.querySelector(sel);
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 120);
  };
  addEventListener('keydown', (e) => {
    if (e.target.closest('a, button, input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'enter' || k === 'a') {
      press('.round.a');
      play();
    } else if (k === 's' || k === 'arrowright') {
      press('.pill.select');
      step(1);
    } else if (k === 'b' || k === 'arrowleft') {
      press('.round.b');
      step(-1);
    }
  });

  // ---------- copy email ----------
  const copyBtn = document.getElementById('copy-email');
  copyBtn.addEventListener('click', async () => {
    const email = 'yl3262@cornell.edu';
    try {
      await navigator.clipboard.writeText(email);
      copyBtn.textContent = 'Copied';
    } catch {
      const sel = getSelection();
      sel.selectAllChildren(document.querySelector('.email'));
      copyBtn.textContent = 'Selected';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
  });
})();
