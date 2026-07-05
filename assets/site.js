// ═══════════════════════════════════════════════════════════════
// notcfo — shared site behavior
// ═══════════════════════════════════════════════════════════════

/* ─── theme toggle ─────────────────────────────────────────── */
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('notcfo-theme', isLight ? 'light' : 'dark'); } catch (e) {}
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon) icon.textContent = isLight ? '\u263E' : '\u2600';
  if (label) label.textContent = isLight ? 'Dark' : 'Light';
}
(function initTheme() {
  try {
    const isLight = localStorage.getItem('notcfo-theme') === 'light';
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon) icon.textContent = isLight ? '\u263E' : '\u2600';
    if (label) label.textContent = isLight ? 'Dark' : 'Light';
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

/* ─── live signal: shared fetch + render ──────────────────── */
const NotcfoSignal = (function () {
  const DATA_URL = '/data/trends.json';
  let cache = null;
  let listeners = [];

  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '\u2014';
    const diffSec = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (diffSec < 60) return diffSec + 's ago';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
    return Math.floor(diffSec / 86400) + 'd ago';
  }

  async function load() {
    try {
      const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      cache = data;
      cache.topics = (cache.topics || []).slice().sort((a, b) => (b.dis || 0) - (a.dis || 0));
      listeners.forEach(fn => fn(cache));
    } catch (err) {
      listeners.forEach(fn => fn(null));
    }
  }

  function subscribe(fn) {
    listeners.push(fn);
    if (cache !== null) fn(cache);
  }

  load();
  setInterval(load, 60 * 1000);

  return { subscribe, relTime };
})();

/* ─── hero ticker (machine voice, right column of hero) ────── */
(function initTicker() {
  const rows = document.getElementById('tickerRows');
  if (!rows) return;
  NotcfoSignal.subscribe((data) => {
    if (!data || !data.topics || !data.topics.length) {
      rows.innerHTML = `
        <div class="ticker-row">
          <span class="tk-theme">signal</span>
          <span class="tk-title">Warming up \u2014 first cycle in progress.</span>
        </div>`;
      return;
    }
    rows.innerHTML = data.topics.slice(0, 3).map(t => `
      <div class="ticker-row">
        <span class="tk-theme">${(t.theme || 'signal').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
        <span class="tk-title">${(t.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 92)}</span>
        <span class="tk-dis">DIS ${Number(t.dis || 0).toFixed(2)}</span>
      </div>
    `).join('');
  });
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
