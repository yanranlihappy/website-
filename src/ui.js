import { LOCATIONS, PROJECT_IDS } from './content.js';

const byId = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const iconTile = (loc, cls = '') =>
  `<span class="tile ${cls}" style="--a:${loc.tint[0]};--b:${loc.tint[1]}" aria-hidden="true">${loc.icon}</span>`;

export function createUI({ onTravel, onView, onSheetChange }) {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div class="labels" aria-hidden="true"></div>
    <div class="view-switch" role="group" aria-label="Camera view">
      <button data-view="front">3/4</button>
      <button data-view="iso">Isometric</button>
      <button data-view="topdown">Top-down</button>
    </div>
    <button class="island" aria-live="polite">
      <span class="island-compact"><span class="island-dot"></span></span>
      <span class="island-full"></span>
    </button>
    <p class="hint">WASD / arrows to walk · click to go · <kbd>E</kbd> to open · <kbd>V</kbd> switch view</p>
    <nav class="dock" aria-label="Dock">
      <button class="app" data-go="about" aria-label="About">${iconTile(byId.about)}<span class="tip">About</span></button>
      <button class="app" data-sheet="work" aria-label="Work">
        <span class="tile" style="--a:#3a3352;--b:#14111f" aria-hidden="true">💼</span><span class="tip">Work</span></button>
      <button class="app" data-go="gallery" aria-label="Gallery">${iconTile(byId.gallery)}<span class="tip">Gallery</span></button>
      <button class="app" data-go="contact" aria-label="Contact">${iconTile(byId.contact)}<span class="tip">Contact</span></button>
      <span class="dock-sep"></span>
      <a class="app" href="index.html" aria-label="Back to the home page">
        <span class="tile" style="--a:#ffffff;--b:#e9e4f2" aria-hidden="true">🎮</span><span class="tip">Home page</span></a>
    </nav>
    <div class="sheet-backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
      <div class="sheet-handle"><span class="grabber"></span>
        <button class="sheet-close" aria-label="Close">✕</button></div>
      <div class="sheet-body"></div>
    </section>
    <div class="fade"></div>`;

  const $ = (s) => root.querySelector(s);
  const island = $('.island');
  const islandFull = $('.island-full');
  const sheet = $('.sheet');
  const sheetBody = $('.sheet-body');
  const backdrop = $('.sheet-backdrop');
  const labelsEl = $('.labels');

  // ---------- map labels ----------
  const labels = LOCATIONS.map((loc) => {
    const el = document.createElement('span');
    el.className = 'label';
    el.innerHTML = `${loc.icon} ${esc(loc.label)}`;
    labelsEl.appendChild(el);
    return { loc, el };
  });

  // ---------- view switch ----------
  root.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => onView(b.dataset.view)));
  function setView(v) {
    root.querySelectorAll('.view-switch button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  }

  // ---------- dynamic island ----------
  let nearby = null;
  let toastTimer = 0;
  let toasting = false;
  function renderIsland(content) {
    if (!content) {
      island.classList.remove('expanded');
      return;
    }
    islandFull.innerHTML = content;
    island.classList.add('expanded');
  }
  function setNearby(loc) {
    if (loc === nearby) return;
    nearby = loc;
    if (toasting) return;
    showNearby();
  }
  function showNearby() {
    const loc = nearby;
    if (loc) {
      renderIsland(`${iconTile(loc, 'small')}<span class="island-text"><b>${esc(loc.title)}</b>
        <small>${esc(loc.tags.join(' · '))}</small></span><span class="island-open">Open</span>`);
    } else renderIsland(null);
  }
  function toast(title, sub, ms = 4000) {
    toasting = true;
    renderIsland(`<span class="tile small" style="--a:#ffb199;--b:#ff5fa2">👋</span>
      <span class="island-text"><b>${esc(title)}</b><small>${esc(sub)}</small></span>`);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toasting = false;
      showNearby();
    }, ms);
  }
  island.addEventListener('click', () => {
    if (!nearby) return;
    clearTimeout(toastTimer);
    toasting = false;
    open(nearby.id);
  });

  // ---------- dock ----------
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      onTravel(b.dataset.go);
    }),
  );
  $('[data-sheet="work"]').addEventListener('click', () => open('work'));

  // ---------- sheet with iOS-style detents ----------
  let current = null;
  let y = 0;
  const detents = () => {
    const h = sheet.offsetHeight;
    return { full: 0, half: Math.round(h * 0.42), closed: h + 40 };
  };
  function setY(v, animate = true) {
    y = v;
    sheet.classList.toggle('animating', animate);
    sheet.style.setProperty('--y', `${v}px`);
    const d = detents();
    backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - v / d.half)) * 0.35 + (v < d.closed - 40 ? 0.1 : 0));
    root.classList.toggle('sheet-full', v < d.half / 2);
  }

  function renderLocation(loc) {
    return `
      <div class="hero" style="--a:${loc.tint[0]};--b:${loc.tint[1]}"><span>${loc.icon}</span></div>
      <h2 id="sheet-title">${esc(loc.title)}</h2>
      <div class="chips">${loc.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="lede">${esc(loc.summary)}</p>
      ${loc.sections.map((s) => `<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p>`).join('')}
      <a class="cta" href="${esc(loc.link.href)}" target="_blank" rel="noopener">${esc(loc.link.text)} ↗</a>`;
  }
  function renderWork() {
    return `
      <h2 id="sheet-title">Work</h2>
      <p class="lede">Each project is a place in town. Pick one to walk there.</p>
      <ul class="cards">${PROJECT_IDS.map((id) => byId[id])
        .map(
          (l) => `<li><button class="card" data-travel="${l.id}">${iconTile(l)}
            <span><b>${esc(l.title)}</b><small>${esc(l.tags.join(' · '))}</small></span><span class="go">Go</span></button></li>`,
        )
        .join('')}</ul>`;
  }

  function open(id) {
    current = id;
    sheetBody.innerHTML = id === 'work' ? renderWork() : renderLocation(byId[id]);
    sheetBody.scrollTop = 0;
    sheet.hidden = false;
    root.classList.add('sheet-open');
    setY(detents().closed, false);
    requestAnimationFrame(() => requestAnimationFrame(() => setY(detents().half)));
    sheetBody.querySelectorAll('[data-travel]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        onTravel(b.dataset.travel, true);
      }),
    );
    onSheetChange(id);
  }
  function close() {
    if (!current) return;
    current = null;
    setY(detents().closed);
    root.classList.remove('sheet-open', 'sheet-full');
    setTimeout(() => !current && (sheet.hidden = true), 350);
    onSheetChange(null);
  }

  // drag the handle (or the hero) to move between detents
  let drag = null;
  const startDrag = (e) => {
    drag = { start: e.clientY, y0: y, t: performance.now(), last: e.clientY, v: 0 };
    sheet.setPointerCapture(e.pointerId);
  };
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.sheet-handle, .hero') && !e.target.closest('button')) startDrag(e);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const now = performance.now();
    drag.v = (e.clientY - drag.last) / Math.max(1, now - drag.t);
    drag.last = e.clientY;
    drag.t = now;
    let ny = drag.y0 + (e.clientY - drag.start);
    if (ny < 0) ny *= 0.25; // rubber band past the top
    setY(ny, false);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = detents();
    const v = drag.v;
    drag = null;
    if (v > 0.6) return y > d.half * 0.5 ? close() : setY(d.half);
    if (v < -0.6) return setY(y > d.half ? d.half : d.full);
    const nearest = [d.full, d.half, d.closed].reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
    nearest === d.closed ? close() : setY(nearest);
  };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);
  // scrolling the content at the half detent expands the sheet, like iOS
  sheetBody.addEventListener('wheel', (e) => e.deltaY > 0 && y > 0 && setY(0), { passive: true });
  sheetBody.addEventListener('touchmove', () => y > 0 && setY(0), { passive: true });
  $('.sheet-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  addEventListener('resize', () => current && setY(Math.min(y, detents().half), false));

  // ---------- transitions ----------
  const fadeEl = $('.fade');
  function fade(mid) {
    fadeEl.classList.add('on');
    setTimeout(() => {
      mid();
      fadeEl.classList.remove('on');
    }, 320);
  }

  function updateLabels(project) {
    for (const { loc, el } of labels) {
      const p = project(loc.building);
      if (!p || p.x < -100 || p.y < -50 || p.x > innerWidth + 100 || p.y > innerHeight + 50) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('near', nearby === loc);
    }
  }

  return {
    setNearby,
    toast,
    open,
    close,
    fade,
    setView,
    updateLabels,
    isOpen: () => current !== null,
    nearby: () => nearby,
    byId,
  };
}
