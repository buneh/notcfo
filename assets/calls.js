// notcfo — Standing Calls, integrated with history
//
// Reads three static, repo-committed JSON files and renders them together,
// per domain, under Standing Calls:
//   /data/calls.json            — the Orchestra's active forecasts
//   /data/track-record.json     — REAL resolved calls (moved here via the Desk)
//   /data/backtest-results.json — the resolution agent's research verification
//                                  on 20 historical windows — NOT real Orchestra
//                                  forecasts. No live call was ever made for
//                                  those windows; this only tests whether the
//                                  resolution agent can find and judge facts
//                                  correctly. Labeled and worded differently
//                                  from real results on purpose, so it's never
//                                  mistaken for a graded prediction.
//
// "Orchestra forecast tracker" = real track record, per domain — In tune /
//   Out of tune / Partial. Empty until a real call actually resolves.
// "Resolution agent forecast verification" = backtest, per domain —
//   Confirmed / Not confirmed / Partial / Unresolved.
//
// Supports the human/machine view toggle: machine view shows all three
// raw JSON files, clearly labeled, in the same container.

(function(){

let latestCalls = null;
let latestTrackRecord = null;
let latestBacktest = null;
let machineMode = document.documentElement.classList.contains('machine-view');

function $(id){ return document.getElementById(id); }

function esc(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

function renderJSONBlock(obj){
  const json = JSON.stringify(obj, null, 2);
  const escaped = esc(json);
  return `<pre class="mv-block">${escaped.replace(/"([^"\n]+)":/g, '<span class="mv-key">"$1"</span>:')}</pre>`;
}

function timeAgo(iso){
  if(!iso) return '\u2014';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function formatShortDate(iso){
  if(!iso) return '\u2014';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

const HORIZON_LABEL = { '24h': '24 Hours', '1w': '1 Week', '1m': '1 Month', '1y': '1 Year' };

const DOMAIN_ORDER = ['macro', 'markets', 'crypto', 'geopolitics', 'ai'];
const DOMAIN_LABELS = {
  macro: 'Macro Health & Sentiment',
  markets: 'Financial & Capital Markets',
  crypto: 'Crypto Markets',
  geopolitics: 'Geopolitics, Policy & Regulatory',
  ai: 'Frontier AI & Energy'
};
const LABEL_TO_ID = Object.fromEntries(Object.entries(DOMAIN_LABELS).map(([id, label]) => [label, id]));

// Real Orchestra performance — earned language, only ever shown against
// actual resolved calls.
const TRACKER_LABEL = { yes: 'In tune', no: 'Out of tune', partial: 'Partial' };

// Resolution-agent research verification — plain, factual language on
// purpose. This is not a graded forecast, so it doesn't get the musical
// framing reserved for real Orchestra results.
const VERIFY_LABEL = { yes: 'Confirmed', no: 'Not confirmed', partial: 'Partial', unresolvable: 'Unresolved', error: 'Unresolved' };

function seqHTML(items, labelFn, dateFn){
  return items.map(item => {
    const label = labelFn(item);
    const cls = item.outcome === 'yes' || item.proposedOutcome === 'yes' ? 'tr-bt-yes' : '';
    return `<span class="${cls}">${dateFn(item)}: ${esc(label)}</span>`;
  }).join(' <span class="tr-bt-sep">&middot;</span> ');
}

function domainBlockHTML(domainId, currentCall, resolvedForDomain, backtestForDomain){
  const label = DOMAIN_LABELS[domainId];

  const callPart = currentCall
    ? `<div class="mf-k">
         <span>${esc(label)}</span>
         <span class="calls-prob">${currentCall.probability}% <span class="calls-horizon">&middot; ${HORIZON_LABEL[currentCall.horizon] || currentCall.horizon}</span></span>
       </div>
       <div class="mf-v"><strong>${esc(currentCall.question)}</strong><br>${esc(currentCall.forecast)}</div>`
    : `<div class="mf-k"><span>${esc(label)}</span></div>
       <div class="mf-v">No active call right now \u2014 this domain's slot is between calls.</div>`;

  const trackerSeq = resolvedForDomain.length === 0
    ? 'Pending'
    : seqHTML(
        resolvedForDomain.slice().sort((a,b) => new Date(b.resolvedAt) - new Date(a.resolvedAt)),
        r => TRACKER_LABEL[r.outcome] || r.outcome,
        r => r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : '\u2014'
      );

  const verifyBlock = backtestForDomain.length === 0 ? '' : `
    <div class="orch-tracker">
      <div class="orch-tracker-label">Resolution agent forecast verification</div>
      <div class="orch-tracker-seq">${seqHTML(
        backtestForDomain.slice().sort((a,b) => a.window.calledAt > b.window.calledAt ? -1 : 1),
        c => VERIFY_LABEL[c.proposedOutcome] || c.proposedOutcome,
        c => formatShortDate(c.window.calledAt)
      )}</div>
    </div>`;

  return `<div class="mf-row">
    ${callPart}
    <div class="orch-tracker">
      <div class="orch-tracker-label">Orchestra forecast tracker</div>
      <div class="orch-tracker-seq">${trackerSeq}</div>
    </div>
    ${verifyBlock}
  </div>`;
}

function renderHuman(){
  const wrap = $('callsCurrent');
  const calls = (latestCalls && latestCalls.calls) || [];
  const resolved = (latestTrackRecord && latestTrackRecord.resolved) || [];
  const btCases = (latestBacktest && latestBacktest.cases) || [];

  let html = '<div class="machine-fact-list">';
  for(const domId of DOMAIN_ORDER){
    const currentCall = calls.find(c => c.id === domId) || null;
    const resolvedForDomain = resolved.filter(r => LABEL_TO_ID[r.domain] === domId);
    const backtestForDomain = btCases.filter(c => c.caseId.split('_')[0] === domId);
    html += domainBlockHTML(domId, currentCall, resolvedForDomain, backtestForDomain);
  }
  html += '</div>';
  wrap.innerHTML = html;
}

function safeBlock(label, obj, fallback){
  try{
    return `<div class="label-gold" style="margin:1.5rem 0 .5rem">${label}</div>${renderJSONBlock(obj)}`;
  }catch(e){
    console.error(`Machine view: failed to render ${label}:`, e);
    return `<div class="label-gold" style="margin:1.5rem 0 .5rem">${label}</div><div class="calls-empty">Couldn't render this file.</div>`;
  }
}

function renderMachine(){
  const wrap = $('callsCurrent');
  wrap.innerHTML =
    safeBlock('calls.json', latestCalls || { calls: [] }) +
    safeBlock('track-record.json', latestTrackRecord || { resolved: [] }) +
    safeBlock('backtest-results.json', latestBacktest || { cases: [] });
}

function renderAll(){
  $('callsUpdated').textContent = timeAgo(latestCalls && latestCalls.generatedAt);
  $('callsCount').textContent = ((latestCalls && latestCalls.calls) || []).length + ' active';
  if(machineMode) renderMachine(); else renderHuman();
}

document.addEventListener('notcfo:viewchange', (e) => {
  machineMode = e.detail.machine;
  renderAll();
});

async function load(){
  try{
    const res = await fetch('/data/calls.json');
    latestCalls = res.ok ? await res.json() : { calls: [], generatedAt: null };
  }catch(e){ latestCalls = { calls: [], generatedAt: null }; }

  try{
    const res = await fetch('/data/track-record.json');
    latestTrackRecord = res.ok ? await res.json() : { resolved: [] };
  }catch(e){ latestTrackRecord = { resolved: [] }; }

  try{
    const res = await fetch('/data/backtest-results.json?t=' + Date.now(), { cache: 'no-store' });
    latestBacktest = res.ok ? await res.json() : null;
  }catch(e){ latestBacktest = null; }

  renderAll();
}

load();

})();
