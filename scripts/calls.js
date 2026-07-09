// notcfo — Standing Calls + Track Record
// Reads two static, repo-committed JSON files:
//   /data/calls.json          — overwritten by the scheduled generator (scripts/generate-calls.mjs)
//   /data/track-record.json   — hand-curated: a call moves here once a human resolves it
// No live API calls, no key needed to view — this is the "ambient" counterpart to the
// interactive Oracle section above it.
//
// Supports the human/machine view toggle: machine view renders the
// literal fetched JSON via <pre> blocks, not a restyled approximation
// of it — see renderJSONBlock below.

(function(){

let latestCalls = null;
let latestTrackRecord = null;
let machineMode = document.documentElement.classList.contains('machine-view');

function $(id){ return document.getElementById(id); }

function timeAgo(iso){
  if(!iso) return '\u2014';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function esc(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

function renderJSONBlock(obj){
  const json = JSON.stringify(obj, null, 2);
  const escaped = esc(json);
  const highlighted = escaped.replace(/"([^"\n]+)":/g, '<span class="mv-key">"$1"</span>:');
  return `<pre class="mv-block">${highlighted}</pre>`;
}

const HORIZON_LABEL = { '24h': '24 Hours', '1w': '1 Week', '1m': '1 Month', '1y': '1 Year' };

function renderCurrentHuman(data){
  const wrap = $('callsCurrent');
  const calls = (data && data.calls) || [];

  if(calls.length === 0){
    wrap.innerHTML = `<div class="calls-empty">
      <strong>No standing calls yet</strong>
      The generator hasn't run for the first time. Once the scheduled job fires, five calls will appear here.
    </div>`;
    return;
  }

  wrap.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'machine-fact-list';
  calls.forEach(c => {
    const row = document.createElement('div');
    row.className = 'mf-row';
    row.innerHTML = `
      <div class="mf-k">
        <span>${c.domain}</span>
        <span class="calls-prob">${c.probability}% <span class="calls-horizon">&middot; ${HORIZON_LABEL[c.horizon] || c.horizon}</span></span>
      </div>
      <div class="mf-v">${c.question ? `<em>${c.question}</em><br>` : ''}${c.forecast}</div>`;
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

function renderTrackRecordHuman(data){
  const wrap = $('trackRecord');
  const resolved = (data && data.resolved) || [];

  if(resolved.length === 0){
    wrap.innerHTML = `<div class="tr-empty">
      <strong>No resolved calls yet</strong>
      The first standing calls haven't reached their horizon. Check back once one resolves.
    </div>`;
    return;
  }

  const sorted = resolved.slice().sort((a,b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
  wrap.innerHTML = '';
  sorted.forEach(r => {
    const outcomeClass = {
      yes: 'tr-outcome-yes', no: 'tr-outcome-no',
      partial: 'tr-outcome-partial', pending: 'tr-outcome-pending'
    }[r.outcome] || 'tr-outcome-pending';
    const outcomeLabel = { yes: 'Correct', no: 'Wrong', partial: 'Partial', pending: 'Pending' }[r.outcome] || r.outcome;

    const row = document.createElement('div');
    row.className = 'tl-row note-row';
    row.style.gridTemplateColumns = '128px 1fr';
    row.innerHTML = `
      <div class="tl-left">
        <div class="tl-period">${r.domain || ''}</div>
        <div class="tl-org tr-called">Called ${r.calledAt ? new Date(r.calledAt).toLocaleDateString() : '\u2014'} at ${r.calledProbability}%<br>Resolved ${r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : '\u2014'}</div>
      </div>
      <div class="tl-right">
        <h3>${r.question}</h3>
        <div class="tr-outcome ${outcomeClass}">${outcomeLabel}</div>
        ${r.note ? `<p style="margin-top:.5rem">${r.note}</p>` : ''}
      </div>`;
    wrap.appendChild(row);
  });
}

function renderCurrent(data){
  latestCalls = data;
  $('callsUpdated').textContent = timeAgo(data && data.generatedAt);
  $('callsCount').textContent = ((data && data.calls) || []).length + ' active';
  if(machineMode) $('callsCurrent').innerHTML = renderJSONBlock(data || { calls: [] });
  else renderCurrentHuman(data);
}

function renderTrackRecord(data){
  latestTrackRecord = data;
  if(machineMode) $('trackRecord').innerHTML = renderJSONBlock(data || { resolved: [] });
  else renderTrackRecordHuman(data);
}

document.addEventListener('notcfo:viewchange', (e) => {
  machineMode = e.detail.machine;
  if(latestCalls) renderCurrent(latestCalls);
  if(latestTrackRecord) renderTrackRecord(latestTrackRecord);
});

async function load(){
  try{
    const [callsRes, trRes] = await Promise.all([
      fetch('/data/calls.json').catch(() => null),
      fetch('/data/track-record.json').catch(() => null)
    ]);
    const calls = callsRes && callsRes.ok ? await callsRes.json() : { calls: [], generatedAt: null };
    const tr = trRes && trRes.ok ? await trRes.json() : { resolved: [] };
    renderCurrent(calls);
    renderTrackRecord(tr);
  }catch(e){
    renderCurrent(null);
    renderTrackRecord(null);
  }
}

load();

// ─── Track Record infographic (backtest + live resolved calls) ────
// Renders inside #trackRecord, after any manually-resolved entries.
// Fetches data/backtest-results.json and renders a 5-domain × 4-window
// grid showing the resolution agent's historical research results.

let latestBacktest = null;

const DOMAIN_ORDER = ['macro', 'markets', 'crypto', 'geopolitics', 'ai'];
const DOMAIN_LABELS = {
  macro: 'Macro Health & Sentiment',
  markets: 'Financial & Capital Markets',
  crypto: 'Crypto Markets',
  geopolitics: 'Geopolitics, Policy & Regulatory',
  ai: 'Frontier AI & Energy'
};
const OUTCOME_LABELS = {
  yes: 'Yes', no: 'No', partial: 'Partial',
  unresolvable: 'Unresolvable', error: 'Error', pending: '\u2014'
};

function formatDate(iso){
  if(!iso) return '\u2014';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

function renderBacktestHuman(data){
  const wrap = $('trackRecord');
  if(!data || !data.cases || data.cases.length === 0){
    // leave existing empty-state or resolved-calls content untouched
    return;
  }

  // group cases by domain id (first part of caseId before the underscore)
  const grouped = {};
  for(const c of data.cases){
    const domId = c.caseId.split('_')[0];
    if(!grouped[domId]) grouped[domId] = [];
    grouped[domId].push(c);
  }

  // build the infographic
  const info = document.createElement('div');
  info.className = 'tr-info';

  for(const domId of DOMAIN_ORDER){
    const cases = grouped[domId];
    if(!cases || cases.length === 0) continue;

    // sort: most recent window first
    cases.sort((a,b) => a.window.calledAt > b.window.calledAt ? -1 : 1);

    const isWeekly = cases[0].horizon === '1w';

    const section = document.createElement('div');
    section.className = 'tr-domain';
    section.innerHTML = `
      <div class="tr-domain-head">
        <span class="tr-domain-name">${esc(DOMAIN_LABELS[domId] || domId)}</span>
        <span class="tr-domain-horizon">${isWeekly ? 'Weekly' : 'Monthly'}</span>
      </div>`;

    const grid = document.createElement('div');
    grid.className = 'tr-windows';

    for(const c of cases){
      const outcomeClass = 'out-' + (c.proposedOutcome || 'pending');
      const outcomeLabel = OUTCOME_LABELS[c.proposedOutcome] || c.proposedOutcome || '\u2014';

      const win = document.createElement('div');
      win.className = 'tr-window';
      win.innerHTML = `
        <div class="tr-window-dates">${formatDate(c.window.calledAt)} \u2192 ${formatDate(c.window.resolvesAt)}</div>
        <div class="tr-window-outcome ${outcomeClass}">${esc(outcomeLabel)}</div>
        ${c.keyFigures ? `<div class="tr-window-figures">${esc(c.keyFigures).slice(0, 200)}</div>` : ''}`;
      grid.appendChild(win);
    }

    section.appendChild(grid);
    info.appendChild(section);
  }

  info.innerHTML += `<p class="tr-info-note">Backtest: resolution agent researched ${data.cases.length} historical windows (${DOMAIN_ORDER.length} domains) to verify it can find and judge the specific figures each question requires. Results above are the agent's proposed outcomes; human verification is recorded separately.</p>`;

  // clear any existing empty state and append infographic
  const existing = wrap.querySelector('.tr-empty');
  if(existing) existing.remove();

  // remove any previous infographic on re-render
  const prev = wrap.querySelector('.tr-info');
  if(prev) prev.remove();

  wrap.appendChild(info);
}

function renderBacktestMachine(data){
  const wrap = $('trackRecord');
  const prev = wrap.querySelector('.tr-info');
  if(prev) prev.remove();
  const existing = wrap.querySelector('.tr-empty');
  if(existing) existing.remove();

  const block = document.createElement('div');
  block.className = 'tr-info';
  block.innerHTML = renderJSONBlock(data || { cases: [] });
  wrap.appendChild(block);
}

function renderBacktest(data){
  latestBacktest = data;
  if(machineMode) renderBacktestMachine(data); else renderBacktestHuman(data);
}

// re-render on view toggle
const origViewHandler = document.onnotcfoviewchange;
document.addEventListener('notcfo:viewchange', (e) => {
  if(latestBacktest) renderBacktest(latestBacktest);
});

async function loadBacktest(){
  try{
    const res = await fetch('/data/backtest-results.json?t=' + Date.now(), { cache: 'no-store' });
    if(!res.ok) return; // file doesn't exist yet — that's fine, backtest hasn't run
    renderBacktest(await res.json());
  }catch(e){
    // silently ignore — backtest is optional, its absence shouldn't affect the page
  }
}

loadBacktest();

})();
