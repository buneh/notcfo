// notcfo — Standing Calls + Track Record
// Reads two static, repo-committed JSON files:
//   /data/calls.json          — overwritten by the scheduled generator (scripts/generate-calls.mjs)
//   /data/track-record.json   — hand-curated: a call moves here once a human resolves it
// No live API calls, no key needed to view — this is the "ambient" counterpart to the
// interactive Oracle section above it.

(function(){

function $(id){ return document.getElementById(id); }

function timeAgo(iso){
  if(!iso) return '\u2014';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

const HORIZON_LABEL = { '24h': '24 Hours', '1w': '1 Week', '1m': '1 Month', '1y': '1 Year' };

function renderCurrent(data){
  const wrap = $('callsCurrent');
  const calls = (data && data.calls) || [];
  $('callsUpdated').textContent = timeAgo(data && data.generatedAt);
  $('callsCount').textContent = calls.length + ' active';

  if(calls.length === 0){
    wrap.innerHTML = `<div class="calls-empty">
      <strong>No standing calls yet</strong>
      The generator hasn't run for the first time. Once the scheduled job fires, four calls will appear here.
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

function renderTrackRecord(data){
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

})();
