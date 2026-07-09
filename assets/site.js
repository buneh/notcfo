// ═══════════════════════════════════════════════════════════════
// notcfo — shared site behavior
// ═══════════════════════════════════════════════════════════════

/* ─── theme toggle ─────────────────────────────────────────── */
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('notcfo-theme', isLight ? 'light' : 'dark'); } catch (e) {}
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = isLight ? 'Dark' : 'Light';
}
(function initTheme() {
  try {
    const isLight = localStorage.getItem('notcfo-theme') === 'light';
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = isLight ? 'Dark' : 'Light';
  } catch (e) {}
})();

/* ─── view toggle: human / machine ────────────────────────────
   Machine view shows the same underlying data an agent would get
   from the published JSON files (data/calls.json, signal.json,
   track-record.json) — literal fields, not restyled prose. Other
   scripts (signal.js, calls.js) listen for 'notcfo:viewchange' and
   re-render their already-fetched data in the new mode, so toggling
   never triggers a re-fetch. */
function toggleView() {
  const isMachine = document.documentElement.classList.toggle('machine-view');
  try { localStorage.setItem('notcfo-view', isMachine ? 'machine' : 'human'); } catch (e) {}
  updateViewButton(isMachine);
  document.dispatchEvent(new CustomEvent('notcfo:viewchange', { detail: { machine: isMachine } }));
}
function updateViewButton(isMachine) {
  const label = document.getElementById('viewLabel');
  if (label) label.textContent = isMachine ? 'Human View' : 'Machine View';
}
(function initView() {
  try {
    const isMachine = localStorage.getItem('notcfo-view') === 'machine';
    updateViewButton(isMachine);
  } catch (e) {}
})();

/* ─── mobile menu ──────────────────────────────────────────── */
function toggleMenu() {
  document.getElementById('burger').classList.toggle('open');
  document.getElementById('mobMenu').classList.toggle('open');
}
function closeMenu() {
  document.getElementById('burger').classList.remove('open');
  document.getElementById('mobMenu').classList.remove('open');
}

/* ─── scroll reveal ────────────────────────────────────────── */
(function initReveal() {
  const els = document.querySelectorAll('.rev');
  if (!('IntersectionObserver' in window) || !els.length) {
    els.forEach(el => el.classList.add('vis'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
})();

/* ─── schedule form (about page) ────────────────────────────── */
(function initSchedule() {
  document.querySelectorAll('.sesh').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.sesh').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
    });
  });
  document.querySelectorAll('.slot:not(.na)').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.slot').forEach(s => s.classList.remove('on'));
      el.classList.add('on');
    });
  });
})();
