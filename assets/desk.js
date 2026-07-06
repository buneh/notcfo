// notcfo — The Desk
// Reads data/resolution-drafts.json via the GitHub Contents API using a
// personal access token held only in memory, renders each draft as an
// editable card, and on Approve writes the (possibly edited) result into
// data/track-record.json, removes the call from data/calls.json (opening
// that slot for a fresh call), and clears the draft. Decline just clears
// the draft — the call stays active and the resolver will research it
// again on its next scheduled run.

(function(){

const REPO = 'buneh/notcfo';
const BRANCH = 'main';

let pat = null;
let draftsCache = [];

function $(id){ return document.getElementById(id); }

// ---------- UTF-8 safe base64 helpers ----------
function b64DecodeUnicode(str){
  return decodeURIComponent(atob(str).split('').map(c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
}
function b64EncodeUnicode(str){
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  ));
}

// ---------- GitHub Contents API ----------
async function ghGetFile(path){
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`, {
    headers: {
      'Authorization': `token ${pat}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if(!res.ok) throw new Error(`Couldn't read ${path} (HTTP ${res.status}). Check the token's permissions.`);
  const data = await res.json();
  let content;
  try{
    content = JSON.parse(b64DecodeUnicode(data.content.replace(/\n/g, '')));
  }catch(e){
    throw new Error(`${path} isn't valid JSON right now — check it on GitHub directly.`);
  }
  return { content, sha: data.sha };
}

async function ghPutFile(path, contentObj, sha, message){
  const body = {
    message,
    content: b64EncodeUnicode(JSON.stringify(contentObj, null, 2) + '\n'),
    sha,
    branch: BRANCH
  };
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const errText = await res.text().catch(() => '');
    throw new Error(`Couldn't save ${path} (HTTP ${res.status}). ${errText.slice(0, 150)}`);
  }
  return res.json();
}

// ---------- token handling (in-memory only) ----------
function refreshKeyUI(){
  const hasToken = !!pat;
  $('keyEntryRow').style.display = hasToken ? 'none' : 'flex';
  $('keyStatusRow').style.display = hasToken ? 'flex' : 'none';
  $('deskBody').classList.toggle('desk-locked', !hasToken);
  $('deskStatus').style.display = hasToken ? 'flex' : 'none';
}
$('saveKeyBtn').onclick = () => {
  const val = $('patInput').value.trim();
  if(!val) return;
  pat = val;
  $('patInput').value = '';
  refreshKeyUI();
  loadDrafts();
};
$('changeKeyBtn').onclick = () => {
  pat = null;
  refreshKeyUI();
};
$('patInput').addEventListener('keydown', e => { if(e.key === 'Enter') $('saveKeyBtn').click(); });
refreshKeyUI();

// ---------- rendering ----------
function fieldRow(label, value, extraClass){
  return `<div class="desk-ctx-item"><span class="label">${label}</span><div class="val ${extraClass||''}">${value}</div></div>`;
}

function renderDrafts(){
  const list = $('deskList');
  if(draftsCache.length === 0){
    list.innerHTML = `<div class="desk-empty"><strong>No drafts awaiting review</strong><p>Nothing's past its horizon without an existing draft right now. Check back after the next scheduled run, or trigger it manually from the Actions tab.</p></div>`;
    $('deskCount').textContent = '0 pending';
    return;
  }
  $('deskCount').textContent = draftsCache.length + ' pending';
  list.innerHTML = '';
  draftsCache.forEach(draft => {
    const card = document.createElement('div');
    card.className = 'desk-card';
    card.dataset.id = draft.id;
    const outcomeOptions = ['yes', 'no', 'partial'].map(o =>
      `<option value="${o}" ${o === draft.proposedOutcome ? 'selected' : ''}>${o.toUpperCase()}</option>`
    ).join('');
    card.innerHTML = `
      <div class="desk-card-head">
        <div class="desk-domain">${draft.domain}</div>
        <div class="desk-question">${draft.question}</div>
      </div>
      <div class="desk-context">
        ${fieldRow('Called', new Date(draft.calledAt).toLocaleDateString())}
        ${fieldRow('Original probability', draft.calledProbability + '%', 'gold')}
        ${fieldRow('Horizon', draft.horizon)}
      </div>
      <div class="desk-field">
        <label>Resolution criteria</label>
        <textarea class="f-criteria">${draft.resolutionCriteria || ''}</textarea>
      </div>
      <div class="desk-field">
        <label>Proposed outcome</label>
        <select class="f-outcome">${outcomeOptions}</select>
      </div>
      <div class="desk-field">
        <label>Evidence</label>
        <textarea class="f-evidence">${draft.evidenceSummary || ''}</textarea>
      </div>
      <div class="desk-field">
        <label>Sources</label>
        <div class="desk-sources">${(draft.sources || []).join(', ') || '\u2014'}</div>
      </div>
      <div class="desk-actions">
        <button type="button" class="desk-approve">Approve</button>
        <button type="button" class="desk-decline">Decline &amp; re-research</button>
        <span class="desk-card-status"></span>
      </div>`;
    card.querySelector('.desk-approve').onclick = () => approveDraft(draft, card);
    card.querySelector('.desk-decline').onclick = () => declineDraft(draft, card);
    list.appendChild(card);
  });
}

function setCardStatus(card, msg, isError){
  const el = card.querySelector('.desk-card-status');
  el.textContent = msg || '';
  el.classList.toggle('err', !!isError);
}

// ---------- actions ----------
async function approveDraft(draft, card){
  card.classList.add('busy');
  setCardStatus(card, 'Approving\u2026');
  const criteria = card.querySelector('.f-criteria').value.trim();
  const outcome = card.querySelector('.f-outcome').value;
  const evidence = card.querySelector('.f-evidence').value.trim();

  try{
    const tr = await ghGetFile('data/track-record.json');
    tr.content.resolved = tr.content.resolved || [];
    tr.content.resolved.push({
      id: draft.id,
      domain: draft.domain,
      question: draft.question,
      resolutionCriteria: criteria,
      calledAt: draft.calledAt,
      calledProbability: draft.calledProbability,
      horizon: draft.horizon,
      resolvedAt: new Date().toISOString(),
      outcome,
      note: evidence,
      sources: draft.sources || []
    });
    await ghPutFile('data/track-record.json', tr.content, tr.sha, `Resolve ${draft.id}: ${outcome.toUpperCase()} [desk]`);

    const cj = await ghGetFile('data/calls.json');
    cj.content.calls = (cj.content.calls || []).filter(c => c.id !== draft.id);
    await ghPutFile('data/calls.json', cj.content, cj.sha, `Remove resolved call ${draft.id} [desk]`);

    const dj = await ghGetFile('data/resolution-drafts.json');
    dj.content.drafts = (dj.content.drafts || []).filter(d => d.id !== draft.id);
    await ghPutFile('data/resolution-drafts.json', dj.content, dj.sha, `Clear reviewed draft ${draft.id} [desk]`);

    draftsCache = draftsCache.filter(d => d.id !== draft.id);
    card.classList.add('done');
    if(draftsCache.length === 0) renderDrafts();
    else $('deskCount').textContent = draftsCache.length + ' pending';
  }catch(e){
    card.classList.remove('busy');
    setCardStatus(card, e.message, true);
  }
}

async function declineDraft(draft, card){
  card.classList.add('busy');
  setCardStatus(card, 'Declining\u2026');
  try{
    const dj = await ghGetFile('data/resolution-drafts.json');
    dj.content.drafts = (dj.content.drafts || []).filter(d => d.id !== draft.id);
    await ghPutFile('data/resolution-drafts.json', dj.content, dj.sha, `Decline draft ${draft.id}, will re-research [desk]`);

    draftsCache = draftsCache.filter(d => d.id !== draft.id);
    card.classList.add('done');
    if(draftsCache.length === 0) renderDrafts();
    else $('deskCount').textContent = draftsCache.length + ' pending';
  }catch(e){
    card.classList.remove('busy');
    setCardStatus(card, e.message, true);
  }
}

// ---------- initial load ----------
async function loadDrafts(){
  $('deskList').innerHTML = `<div class="desk-empty"><strong>Loading\u2026</strong><p>Reading resolution-drafts.json from the repo.</p></div>`;
  try{
    const { content } = await ghGetFile('data/resolution-drafts.json');
    draftsCache = content.drafts || [];
    $('deskUpdated').textContent = 'loaded ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    renderDrafts();
  }catch(e){
    $('deskList').innerHTML = `<div class="desk-empty"><strong>Couldn't load drafts</strong><p>${e.message}</p></div>`;
  }
}

})();
