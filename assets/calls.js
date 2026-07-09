// notcfo — Standing Calls + Track Record + Backtest Infographic
//
// Reads three static, repo-committed JSON files:
//   /data/calls.json            — the Orchestra's active standing forecasts
//   /data/track-record.json     — resolved calls, moved here via the Desk
//   /data/backtest-results.json — historical resolution agent verification
//
// Render isolation: #callsCurrent, #trResolved, and #trBacktest are
// three separate containers that never overwrite each other. The
// previous version used a single #trackRecord and competed via
// innerHTML — that's the race condition that caused the backtest
// infographic to vanish when the empty track-record state rendered
// second.
//
// Load is chained: calls + track-record fetch first, then backtest
// fetches and renders — guaranteed ordering, no race.

(function(){

let latestCalls = null;
let latestTrackRecord = null;
let latestBacktest = null;
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

// ─── Standing Calls ──────────────────────────────────────────

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
        <span>${esc(c.domain)}</span>
        <span class="calls-prob">${c.probability}% <span class="calls-horizon">&middot; ${HORIZON_LABEL[c.horizon] || c.horizon}</span></span>
      </div>
      <div class="mf-v">${c.question ? `<em>${esc(c.question)}</em><br>` : ''}${esc(c.forecast)}</div>`;
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

function renderCurrent(data){
  latestCalls = data;
  $('callsUpdated').textContent = timeAgo(data && data.generatedAt);
  $('callsCount').textContent = ((data && data.calls) || []).length + ' active';
  if(machineMode) $('callsCurrent').innerHTML = renderJSONBlock(data || { calls: [] });
  else renderCurrentHuman(data);
}

// ─── Track Record (manually resolved calls) ─────────────────

function renderTrackRecordHuman(data){
  const wrap = $('trResolved');
  if(!wrap) return;
  const resolved = (data && data.resolved) || [];

  if(resolved.length === 0){
    wrap.innerHTML = '';
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
        <div class="tl-period">${esc(r.domain || '')}</div>
        <div class="tl-org tr-called">Called ${r.calledAt ? new Date(r.calledAt).toLocaleDateString() : '\u2014'} at ${r.calledProbability}%<br>Resolved ${r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : '\u2014'}</div>
      </div>
      <div class="tl-right">
        <h3>${esc(r.question)}</h3>
        <div class="tr-outcome ${outcomeClass}">${esc(outcomeLabel)}</div>
        ${r.note ? `<p style="margin-top:.5rem">${esc(r.note)}</p>` : ''}
      </div>`;
    wrap.appendChild(row);
  });
}

function renderTrackRecord(data){
  latestTrackRecord = data;
  const wrap = $('trResolved');
  if(!wrap) return;
  if(machineMode) wrap.innerHTML = renderJSONBlock(data || { resolved: [] });
  else renderTrackRecordHuman(data);
}

// ─── Backtest Infographic ────────────────────────────────────

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
  unresolvable: 'Unresolvable', error: 'Error'
};

function formatDate(iso){
  if(!iso) return '\u2014';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

function renderBacktestHuman(data){
  const wrap = $('trBacktest');
  if(!wrap) return;
  if(!data || !data.cases || data.cases.length === 0){
    wrap.innerHTML = '';
    return;
  }

  const grouped = {};
  for(const c of data.cases){
    const domId = c.caseId.split('_')[0];
    if(!grouped[domId]) grouped[domId] = [];
    grouped[domId].push(c);
  }

  let html = '<div class="machine-fact-list">';
  for(const domId of DOMAIN_ORDER){
    const cases = grouped[domId];
    if(!cases || cases.length === 0) continue;

    cases.sort((a,b) => a.window.calledAt > b.window.calledAt ? -1 : 1);

    const sequence = cases.map(c => {
      const label = OUTCOME_LABELS[c.proposedOutcome] || c.proposedOutcome || '\u2014';
      const cls = c.proposedOutcome === 'yes' ? 'tr-bt-yes' : '';
      return `<span class="${cls}">${formatDate(c.window.calledAt)}: ${esc(label)}</span>`;
    }).join(' <span class="tr-bt-sep">&middot;</span> ');

    html += `<div class="mf-row">
      <div class="mf-k">${esc(DOMAIN_LABELS[domId] || domId)}</div>
      <div class="mf-v">${sequence}</div>
    </div>`;
  }
  html += '</div>';

  html += `<p class="tr-info-note">Backtest: the resolution agent's research verdict on ${data.cases.length} historical windows across ${DOMAIN_ORDER.length} domains, run before any live call has reached its horizon.</p>`;

  wrap.innerHTML = html;
}

function renderBacktest(data){
  latestBacktest = data;
  const wrap = $('trBacktest');
  if(!wrap) return;
  if(machineMode) wrap.innerHTML = renderJSONBlock(data || { cases: [] });
  else renderBacktestHuman(data);
}

// ─── View toggle listener ────────────────────────────────────

document.addEventListener('notcfo:viewchange', (e) => {
  machineMode = e.detail.machine;
  if(latestCalls) renderCurrent(latestCalls);
  if(latestTrackRecord) renderTrackRecord(latestTrackRecord);
  if(latestBacktest) renderBacktest(latestBacktest);
});

// ─── Chained load (calls + track-record first, then backtest) ─

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

  // Backtest loads AFTER track-record — guaranteed order, no race
  try{
    const res = await fetch('/data/backtest-results.json?t=' + Date.now(), { cache: 'no-store' });
    if(res.ok) renderBacktest(await res.json());
  }catch(e){
    // silently ignore — backtest is optional
  }
}

load();

})();
