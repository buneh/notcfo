// notcfo — The Signal
// Reads /data/signal.json — five entries, one per coverage domain, each
// a distilled headline + summary from that domain's most recent Sensing
// run. Written by scripts/generate-calls.mjs, refreshed daily, no key
// needed to view. This replaced Trendscope entirely: previously Sensing's
// output was thrown away after feeding the council; now it's condensed
// into something publishable every run.
//
// Supports the human/machine view toggle: machine view renders the
// literal fetched JSON via a <pre> block, not a restyled approximation
// of it — see renderJSONBlock below.

(function(){

let latestData = null;
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

// Renders the exact object as formatted JSON, with keys highlighted —
// this is literally JSON.stringify output, not a reconstruction of it.
function renderJSONBlock(obj){
  const json = JSON.stringify(obj, null, 2);
  const escaped = esc(json);
  const highlighted = escaped.replace(/"([^"\n]+)":/g, '<span class="mv-key">"$1"</span>:');
  return `<pre class="mv-block">${highlighted}</pre>`;
}

function renderHuman(data){
  const list = $('signalList');
  const topics = (data && data.topics) || [];

  if(topics.length === 0){
    list.innerHTML = `<div class="ls-empty"><strong>Signal warming up</strong>The first Sensing cycle hasn't completed yet.</div>`;
    return;
  }

  list.innerHTML = '';
  topics.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'ls-row';
    row.innerHTML = `
      <div class="ls-cat">
        <div class="ls-cat-tag">${esc(t.domain)}</div>
        <div class="ls-cat-rank">${String(i + 1).padStart(2, '0')}</div>
      </div>
      <div class="ls-body">
        <div class="ls-title">${esc(t.headline)}</div>
        <p class="signal-summary">${esc(t.summary)}</p>
      </div>`;
    list.appendChild(row);
  });
}

function renderMachine(data){
  $('signalList').innerHTML = renderJSONBlock(data || { topics: [] });
}

function render(data){
  latestData = data;
  const updatedEl = $('signalUpdated');
  if(updatedEl) updatedEl.textContent = data && data.generatedAt ? timeAgo(data.generatedAt) : '\u2014';
  if(machineMode) renderMachine(data); else renderHuman(data);
}

document.addEventListener('notcfo:viewchange', (e) => {
  machineMode = e.detail.machine;
  if(latestData) render(latestData);
});

async function load(){
  try{
    const res = await fetch('/data/signal.json?t=' + Date.now(), { cache: 'no-store' });
    if(!res.ok) throw new Error('http ' + res.status);
    render(await res.json());
  }catch(e){
    $('signalList').innerHTML = `<div class="ls-empty"><strong>Signal unavailable</strong>Couldn't load the latest read right now.</div>`;
  }
}

load();

})();
