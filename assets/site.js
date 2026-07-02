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

/* ─── full live signal section (landing page) ──────────────── */
(function initLiveSignalSection() {
  const list = document.getElementById('ls-list');
  if (!list) return;
  const updatedEl = document.getElementById('ls-updated');
  const countEl = document.getElementById('ls-topic-count');
  const MAX_TOPICS = 10;
  let activeCategory = 'all';
  let allTopics = [];

  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function platformBlock(platforms) {
    const order = [['reddit', 'R'], ['hackernews', 'H'], ['telegram', 'T'], ['google_trends', 'G']];
    const values = Object.values(platforms || {});
    const max = values.length ? Math.max(...values) : 0;
    return '<span class="ls-platforms">' + order.map(([k, ch]) => {
      const v = platforms?.[k] || 0;
      const share = max > 0 ? v / max : 0;
      const klass = share >= 0.66 ? ' on' : share >= 0.25 ? ' mid' : '';
      return `<span class="ls-plat${klass}">${ch}</span>`;
    }).join('') + '</span>';
  }

  function velBlock(v6h) {
    if (v6h == null || Number.isNaN(v6h)) {
      return '<span class="ls-vel ls-vel--flat">\u25AC \u2014</span>';
    }
    const sign = v6h > 0.02 ? 'up' : v6h < -0.02 ? 'down' : 'flat';
    const arrow = sign === 'up' ? '\u25B2' : sign === 'down' ? '\u25BC' : '\u25AC';
    const txt = sign === 'flat' ? 'flat/6h' : (v6h > 0 ? '+' : '') + v6h.toFixed(2) + '/6h';
    return `<span class="ls-vel ls-vel--${sign}">${arrow} ${esc(txt)}</span>`;
  }

  function categoryLabel(cat) {
    const map = { dcm: 'DCM', banking: 'Banking', markets: 'Markets', politics: 'Politics', ai: 'AI', crypto: 'Crypto', other: 'Other', general: 'Other' };
    return map[cat] || (cat || 'Other');
  }

  function rowHtml(topic, rank) {
    const fillPct = Math.max(2, Math.min(100, Math.round((topic.dis_normalized ?? 0) * 100)));
    const topLink = (topic.top_links && topic.top_links[0]) || null;
    const href = topLink ? topLink.url : '#';
    const tag = href !== '#' ? 'a' : 'div';
    const attrs = tag === 'a' ? `href="${esc(href)}" target="_blank" rel="noopener"` : '';
    return `
      <${tag} class="ls-row" data-cat="${esc(topic.category || 'general')}" ${attrs}>
        <div class="ls-cat">
          <span class="ls-cat-rank">${String(rank).padStart(2, '0')}</span>
          <span class="ls-cat-tag">${esc(categoryLabel(topic.category))}</span>
        </div>
        <div class="ls-body">
          <div class="ls-meta">
            <span class="ls-theme">${esc(topic.theme || '\u2014')}</span>
            ${velBlock(topic.velocity_6h)}
          </div>
          <div class="ls-title">${esc(topic.label || '\u2014')}</div>
          <div class="ls-bar-row">
            <div class="ls-bar"><div class="ls-bar-fill" style="width:${fillPct}%;"></div></div>
            <span class="ls-dis">${Number(topic.dis || 0).toFixed(2)}</span>
          </div>
          <div class="ls-data">
            ${platformBlock(topic.platforms)}
            <span><span class="ls-data-num">${Number(topic.n_items || 0)}</span> items</span>
            <span><span class="ls-data-num">${Number(topic.n_participants || 0)}</span> voices</span>
          </div>
        </div>
      </${tag}>`;
  }

  function render() {
    if (!allTopics.length) {
      list.innerHTML = `<div class="ls-empty"><strong>Signal warming up</strong>Topics will appear once the first ingestion cycle completes.</div>`;
      if (countEl) countEl.textContent = '0 topics';
      return;
    }
    const filtered = activeCategory === 'all' ? allTopics : allTopics.filter(t => t.category === activeCategory);
    if (!filtered.length) {
      list.innerHTML = `<div class="ls-empty"><strong>No active topics in this category</strong>Try another, or check back at the next refresh.</div>`;
    } else {
      list.innerHTML = filtered.slice(0, MAX_TOPICS).map((t, i) => rowHtml(t, i + 1)).join('');
    }
    if (countEl) countEl.textContent = allTopics.length + ' active topic' + (allTopics.length === 1 ? '' : 's');
  }

  NotcfoSignal.subscribe((data) => {
    if (!data) {
      list.innerHTML = `<div class="ls-empty"><strong>Signal offline</strong>The pulse feed isn't reachable right now.</div>`;
      if (updatedEl) updatedEl.textContent = '\u2014';
      return;
    }
    allTopics = data.topics || [];
    if (updatedEl) updatedEl.textContent = NotcfoSignal.relTime(data.generated_at);
    render();
  });

  document.querySelectorAll('.ls-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      document.querySelectorAll('.ls-filter').forEach(b => b.classList.toggle('on', b === btn));
      render();
    });
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
