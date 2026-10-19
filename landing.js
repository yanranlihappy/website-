// Landing page: the handheld's buttons, the typing emoticon, and pressing start to enter the town.
(() => {
  const device = document.getElementById('device');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- "I'm Happy :)" with an emoticon that retypes itself ----------
  const FACES = [':)', ':D', '^_^', ';)', ':P', '^o^', ':3'];
  const face = document.getElementById('face');
  if (!reduced) {
    let i = 0;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async function loop() {
      for (;;) {
        await wait(2200);
        for (let n = face.textContent.length; n > 0; n--) {
          face.textContent = face.textContent.slice(0, n - 1);
          await wait(90);
        }
        i = (i + 1) % FACES.length;
        for (const ch of FACES[i]) {
          face.textContent += ch;
          await wait(130);
        }
      }
    })();
  }

  // ---------- live preview in the screen ----------
  const screen = device.querySelector('.screen');
  const live = device.querySelector('.screen-live');
  const fit = () => live.style.setProperty('--fit', String(screen.clientWidth / 640));
  new ResizeObserver(fit).observe(screen);
  fit();
  live.addEventListener('load', () => setTimeout(() => live.classList.add('ready'), 1200));

  // ---------- start ----------
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
      device.style.transformOrigin = `${r.left + r.width / 2 - d.left}px ${r.top + r.height / 2 - d.top}px`;
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

  const ACTIONS = {
    play,
    work: () => document.getElementById('work').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
    about: () => document.getElementById('about').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
  };
  document.getElementById('start').addEventListener('click', play);
  device.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.act]()));

  // keyboard: Enter or A presses start (ignored while focus is on a link or button)
  addEventListener('keydown', (e) => {
    if (e.target.closest('a, button, input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k !== 'enter' && k !== 'a') return;
    const a = device.querySelector('.round.a');
    a.classList.add('pressed');
    setTimeout(() => a.classList.remove('pressed'), 120);
    play();
  });

  // ---------- copy email ----------
  const copyBtn = document.getElementById('copy-email');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('yl3262@cornell.edu');
      copyBtn.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren(document.querySelector('.email'));
      copyBtn.textContent = 'Selected';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
  });
})();
