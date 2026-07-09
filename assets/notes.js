// notcfo — Desk Notes
// Reads /data/desk-notes.json — the human half's dated commentary, kept
// as a real archive rather than hand-pasted HTML. Renders three most
// recent on the homepage (#notesList) with a link to the full archive,
// and every note on the archive page (#notesArchiveList). Each note gets
// a stable id="note-{slug}" anchor for direct linking to one entry.
//
// Supports the human/machine view toggle: machine view renders the
// literal fetched JSON via a <pre> block on whichever page has a
// container present.

(function(){

let latestNotes = null;
let machineMode = document.documentElement.classList.contains('machine-view');

function $(id){ return document.getElementById(id); }

function esc(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
}

// Five abstract marks, one per domain — same primitive (a small filled
// circle) throughout, only the arrangement differs. No representational
// meaning intended; purely a visual distinguishing pattern.
const DOMAIN_ICON_DOTS = {
  macro: [[12,13],[19,11],[14,17],[21,19],[15,23]],
  markets: [[8,9],[24,8],[9,20],[25,17],[16,24]],
  crypto: [[16,8],[8,16],[16,16],[24,16],[16,24]],
  geopolitics: [[9,10],[13,14],[16,19],[21,17],[19,9]],
  ai: [[10,20],[22,21],[16,8],[7,14],[25,12]]
};
function domainIcon(id){
  const dots = DOMAIN_ICON_DOTS[id];
  if(!dots) return '';
  const circles = dots.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join('');
  return `<svg class="dom-icon" viewBox="0 0 32 32" width="16" height="16" aria-hidden="true">${circles}</svg>`;
}

// Notes carry a free-text tag, not a strict domain id — a future note can
// set an explicit `domain` field to match exactly; failing that, this
// checks the tag text against each domain's known keywords. Returns null
// (no icon shown) rather than guessing wrong if nothing matches.
const DOMAIN_KEYWORDS = {
  macro: ['macro', 'sentiment'],
  markets: ['market', 'financial', 'capital', 'dcm', 'rates'],
  crypto: ['crypto', 'bitcoin', 'defi'],
  geopolitics: ['geopolit', 'policy', 'regulat'],
  ai: ['frontier ai', ' ai', 'energy']
};
function matchDomain(note){
  if(note.domain && DOMAIN_ICON_DOTS[note.domain]) return note.domain;
  const tag = (' ' + (note.tag || '')).toLowerCase();
  for(const [id, keywords] of Object.entries(DOMAIN_KEYWORDS)){
    if(keywords.some(k => tag.includes(k))) return id;
  }
  return null;
}

function renderJSONBlock(obj){
  const json = JSON.stringify(obj, null, 2);
  const escaped = esc(json);
  const highlighted = escaped.replace(/"([^"\n]+)":/g, '<span class="mv-key">"$1"</span>:');
  return `<pre class="mv-block">${highlighted}</pre>`;
}

function formatDate(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

function sortedNotes(notes){
  return notes.slice().sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}

function noteRowHTML(n){
  const bullets = (n.body || []).map(p => `<li>${esc(p)}</li>`).join('');
  const domainId = matchDomain(n);
  return `
    <div class="note-row" id="note-${esc(n.id)}">
      <div class="note-left">
        <div class="note-date">${formatDate(n.date)}</div>
        <div class="note-tag"><span class="note-tag-row">${domainId ? domainIcon(domainId) : ''}${esc(n.tag)}</span></div>
      </div>
      <div class="note-right">
        <h3>${esc(n.title)}</h3>
        <ul class="note-bullets">${bullets}</ul>
      </div>
    </div>`;
}

function emptyStateHTML(){
  return `<div class="notes-empty">
    <strong>Nothing posted yet</strong>
    <p>The first entry goes here once a key event calls for a view worth putting a name to.</p>
  </div>`;
}

function renderHomepage(data){
  const wrap = $('notesList');
  if(!wrap) return;
  const notes = (data && data.notes) || [];

  if(notes.length === 0){
    wrap.innerHTML = emptyStateHTML();
    return;
  }

  const recent = sortedNotes(notes).slice(0, 3);
  let html = recent.map(noteRowHTML).join('');
  html += `<div class="notes-archive-link"><a href="/notes.html" class="ls-foot-link">Browse all Desk Notes \u2192</a></div>`;
  wrap.innerHTML = html;
}

function renderArchive(data){
  const wrap = $('notesArchiveList');
  if(!wrap) return;
  const notes = (data && data.notes) || [];

  if(notes.length === 0){
    wrap.innerHTML = emptyStateHTML();
    return;
  }

  wrap.innerHTML = sortedNotes(notes).map(noteRowHTML).join('');
}

function render(data){
  latestNotes = data;
  if(machineMode){
    const homeWrap = $('notesList');
    if(homeWrap) homeWrap.innerHTML = renderJSONBlock(data || { notes: [] });
    const archWrap = $('notesArchiveList');
    if(archWrap) archWrap.innerHTML = renderJSONBlock(data || { notes: [] });
    return;
  }
  renderHomepage(data);
  renderArchive(data);
}

document.addEventListener('notcfo:viewchange', (e) => {
  machineMode = e.detail.machine;
  if(latestNotes) render(latestNotes);
});

async function load(){
  try{
    const res = await fetch('/data/desk-notes.json?t=' + Date.now(), { cache: 'no-store' });
    if(!res.ok) throw new Error('http ' + res.status);
    render(await res.json());
  }catch(e){
    const msg = `<div class="notes-empty"><strong>Notes unavailable</strong><p>Couldn't load Desk Notes right now.</p></div>`;
    const homeWrap = $('notesList'); if(homeWrap) homeWrap.innerHTML = msg;
    const archWrap = $('notesArchiveList'); if(archWrap) archWrap.innerHTML = msg;
  }
}

load();

})();
