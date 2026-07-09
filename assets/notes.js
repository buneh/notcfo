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
  return `
    <div class="note-row" id="note-${esc(n.id)}">
      <div class="note-left">
        <div class="note-date">${formatDate(n.date)}</div>
        <div class="note-tag">${esc(n.tag)}</div>
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
