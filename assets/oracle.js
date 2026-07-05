// notcfo — Oracle
// Bring-your-own-key forecasting council. The key lives only in a JS
// variable for this tab; past auguries persist via localStorage,
// same mechanism the theme toggle already uses on this site.

(function(){

const DOMAINS = [
  { id: 'geo', label: 'Geopolitics' },
  { id: 'markets', label: 'Markets' },
  { id: 'disasters', label: 'Disasters & Climate' },
  { id: 'cyber', label: 'Cyber & Infrastructure' },
  { id: 'tech', label: 'Technology' },
  { id: 'health', label: 'Public Health' }
];
const DEFAULT_ACTIVE = ['geo','markets','disasters'];

const PERSONAS = [
  { id:'analyst', name:'The Analyst', lens:'Ground every claim in comparable historical frequencies and observable current data. Avoid speculation and hedging language.' },
  { id:'skeptic', name:'The Skeptic', lens:'Actively look for reasons the obvious reading could be wrong. Question the framing of the question itself and what could be missing from the signal.' },
  { id:'quant', name:'The Quant', lens:'Think in explicit probability terms. Reference base rates and how you would update on new information. Be numerically precise.' },
  { id:'historian', name:'The Historian', lens:'Draw on the closest historical analogues to this situation and how those resolved. Ground reasoning in precedent.' },
  { id:'contrarian', name:'The Contrarian', lens:"Argue for the scenario consensus is most likely underpricing, even if uncomfortable or low-probability. Find the tail risk." }
];

const HORIZONS = [
  { id:'24h', label:'24 Hours' },
  { id:'1w', label:'1 Week' },
  { id:'1m', label:'1 Month' },
  { id:'1y', label:'1 Year' }
];

const STORAGE_KEY = 'notcfo-oracle-auguries';

let activeDomains = new Set(DEFAULT_ACTIVE);
let currentHorizon = '24h';
let state = null;
let lastRunArgs = null;
let userApiKey = null;

function $(id){ return document.getElementById(id); }

// ---------- domain chips ----------
function renderDomainChips(){
  const wrap = $('orcDomainChips');
  wrap.innerHTML = '';
  DOMAINS.forEach(d=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ls-filter' + (activeDomains.has(d.id) ? ' on' : '');
    b.textContent = d.label;
    b.onclick = ()=>{
      if(activeDomains.has(d.id)) activeDomains.delete(d.id); else activeDomains.add(d.id);
      renderDomainChips();
    };
    wrap.appendChild(b);
  });
}
renderDomainChips();

// ---------- API key ----------
function refreshKeyUI(){
  const hasKey = !!userApiKey;
  $('orcKeyEntryRow').style.display = hasKey ? 'none' : 'flex';
  $('orcKeyStatusRow').style.display = hasKey ? 'flex' : 'none';
  $('orcQueryPanel').classList.toggle('locked', !hasKey);
  $('orcConsultBtn').disabled = !hasKey;
}
$('orcSaveKeyBtn').onclick = ()=>{
  const val = $('orcKeyInput').value.trim();
  if(!val){ showError('Paste a key first — get one at console.anthropic.com/settings/keys.'); return; }
  userApiKey = val;
  $('orcKeyInput').value = '';
  hideError();
  refreshKeyUI();
};
$('orcChangeKeyBtn').onclick = ()=>{
  userApiKey = null;
  refreshKeyUI();
};
$('orcKeyInput').addEventListener('keydown', e=>{ if(e.key === 'Enter') $('orcSaveKeyBtn').click(); });
refreshKeyUI();

// ---------- Claude API ----------
async function callClaude(promptText, useSearch){
  if(!userApiKey) throw new Error('Add your API key above first.');
  const body = { model: 'claude-sonnet-5', max_tokens: 1000, messages: [{ role:'user', content: promptText }] };
  if(useSearch) body.tools = [{ type:'web_search_20250305', name:'web_search' }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': userApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    if(res.status === 401){ userApiKey = null; refreshKeyUI(); throw new Error('That key was rejected — check it and add it again.'); }
    if(res.status === 429) throw new Error('Rate limited by Anthropic — wait a moment and retry.');
    throw new Error('The oracle\u2019s line went dead (HTTP ' + res.status + '). Try again.');
  }
  const data = await res.json();
  const text = (data.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
  if(!text) throw new Error('The oracle returned silence. Try again.');
  return text;
}

function parseJSONLoose(text){
  let cleaned = text.replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if(start >= 0 && end > start) cleaned = cleaned.slice(start, end+1);
  cleaned = cleaned.replace(/[\r\n\t]+/g, ' ');
  return JSON.parse(cleaned);
}

// Persona/synthesis responses use a plain delimited format instead of JSON —
// quotes, apostrophes, and line breaks inside a value need no escaping this
// way, unlike asking a model to hand-produce valid JSON around free text
// (which failed twice in practice: an unescaped newline, then an unescaped
// quote, in two different real runs).
function parseHorizonBlocks(text){
  const parts = text.split(/===\s*(24H|1W|1M|1Y)\s*===/i);
  const blocks = {};
  for(let i = 1; i < parts.length; i += 2){
    blocks[parts[i].toLowerCase()] = parts[i + 1] || '';
  }
  return blocks;
}
function parseFields(text, fieldNames){
  const out = {};
  fieldNames.forEach((name, i) => {
    const next = fieldNames[i + 1];
    const re = next
      ? new RegExp(name + ':\\s*([\\s\\S]*?)\\s*(?=' + next + ':)', 'i')
      : new RegExp(name + ':\\s*([\\s\\S]+)$', 'i');
    const m = text.match(re);
    out[name.toLowerCase()] = m ? m[1].trim() : '';
  });
  return out;
}
function parsePersonaResponse(text){
  const blocks = parseHorizonBlocks(text);
  const forecasts = HORIZONS.map(h => {
    const fields = parseFields(blocks[h.id] || '', ['PROBABILITY', 'HEADLINE', 'REASONING']);
    return {
      horizon: h.id,
      probability: parseInt(fields.probability, 10) || 50,
      headline: fields.headline,
      reasoning: fields.reasoning
    };
  });
  return { forecasts };
}
function parseSynthesisResponse(text){
  const blocks = parseHorizonBlocks(text);
  const horizons = HORIZONS.map(h => {
    const fields = parseFields(blocks[h.id] || '', ['PROBABILITY', 'FORECAST', 'DISSENT_PERSONA', 'DISSENT_OBJECTION']);
    return {
      horizon: h.id,
      consensusProbability: parseInt(fields.probability, 10) || 50,
      forecast: fields.forecast,
      dissent: { persona: fields.dissent_persona, objection: fields.dissent_objection }
    };
  });
  return { horizons };
}

// ---------- prompts ----------
function gatherPrompt(topic, domains){
  const domainLabels = domains.map(id => DOMAINS.find(d=>d.id===id).label).join(', ');
  const focus = topic ? `the question: "${topic}"` : 'a general scan of current world signal';
  return `You are the sensing layer of a live forecasting oracle. Use web search to find current real events (last few days) relevant to ${focus}, within these domains: ${domainLabels}.
Return ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{"summary":"one plain paragraph describing the current state relevant to the query","events":[{"title":"under 14 words","domain":"one of: ${domains.join(', ')}","source":"publication or site name only, no URL","intensity":1-5}],"asOf":"the current date you can infer from search results, e.g. 2026-07-04"}
Limit events to 8-12 items. Every string value must be a single line with no literal line breaks. Do not include any text outside the JSON object.`;
}
function personaPrompt(persona, briefText, topic){
  const q = topic ? `The question being forecast: "${topic}"` : `The question being forecast: "What is most likely to happen next, broadly?"`;
  return `You are ${persona.name}, a member of a five-person forecasting council. Your lens: ${persona.lens}
World-state brief:
${briefText}
${q}
Produce a forecast for four time horizons. Respond in EXACTLY this plain-text format, no JSON, no markdown, no quotation marks wrapping values, nothing before or after it:
===24H===
PROBABILITY: <integer 0-100>
HEADLINE: <under 12 words, concrete claim>
REASONING: <one to two sentences, in character>
===1W===
PROBABILITY: <integer 0-100>
HEADLINE: <under 12 words, concrete claim>
REASONING: <one to two sentences, in character>
===1M===
PROBABILITY: <integer 0-100>
HEADLINE: <under 12 words, concrete claim>
REASONING: <one to two sentences, in character>
===1Y===
PROBABILITY: <integer 0-100>
HEADLINE: <under 12 words, concrete claim>
REASONING: <one to two sentences, in character>
Each PROBABILITY is the likelihood of that horizon's HEADLINE claim being true by that horizon. Be specific and concrete, avoid hedging.`;
}
function synthesisPrompt(personaResults, topic){
  const block = personaResults.map(pr=>{
    const p = PERSONAS.find(x=>x.id===pr.persona);
    return `${p.name}:\n` + pr.data.forecasts.map(f=>`  [${f.horizon}] ${f.probability}% — ${f.headline} (${f.reasoning})`).join('\n');
  }).join('\n\n');
  const q = topic || 'what is most likely to happen next';
  return `You are the Oracle's voice — the final synthesis layer of a forecasting council. Question: "${q}"
Here are the five council members' forecasts:
${block}
For each of the four horizons: compute a consensus probability weighing the five views, write one short grounded forecast paragraph (2-3 sentences, plain language, no mysticism), and identify the strongest dissenting voice with a one-sentence summary of their objection.
Respond in EXACTLY this plain-text format, no JSON, no markdown, no quotation marks wrapping values, nothing before or after it:
===24H===
PROBABILITY: <integer 0-100>
FORECAST: <2-3 sentences>
DISSENT_PERSONA: <exact persona name from the list above>
DISSENT_OBJECTION: <one sentence>
===1W===
PROBABILITY: <integer 0-100>
FORECAST: <2-3 sentences>
DISSENT_PERSONA: <exact persona name from the list above>
DISSENT_OBJECTION: <one sentence>
===1M===
PROBABILITY: <integer 0-100>
FORECAST: <2-3 sentences>
DISSENT_PERSONA: <exact persona name from the list above>
DISSENT_OBJECTION: <one sentence>
===1Y===
PROBABILITY: <integer 0-100>
FORECAST: <2-3 sentences>
DISSENT_PERSONA: <exact persona name from the list above>
DISSENT_OBJECTION: <one sentence>`;
}

// ---------- pipeline UI ----------
function setStage(stage, note){
  const order = ['sensing','council','oracle'];
  const idx = order.indexOf(stage);
  order.forEach((s,i)=>{
    const el = document.querySelector('.orc-stage[data-stage="'+s+'"]');
    el.classList.remove('active','done');
    if(i < idx) el.classList.add('done');
    if(i === idx) el.classList.add('active');
  });
  $('orcStageNote').textContent = note || '\u2014';
}
function showError(msg){ $('orcErrorText').textContent = msg; $('orcErrorBox').classList.add('show'); }
function hideError(){ $('orcErrorBox').classList.remove('show'); }

// ---------- rendering ----------
function renderTicker(gathered){
  const wrap = $('orcTicker');
  wrap.innerHTML = '';
  gathered.events.forEach((ev,i)=>{
    const d = DOMAINS.find(x=>x.id===ev.domain) || DOMAINS[0];
    const pct = Math.max(0, Math.min(5, ev.intensity)) / 5 * 100;
    const row = document.createElement('div');
    row.className = 'ls-row';
    row.innerHTML = `
      <div class="ls-cat">
        <div class="ls-cat-tag">${d.label}</div>
        <div class="ls-cat-rank">${String(i+1).padStart(2,'0')}</div>
      </div>
      <div class="ls-body">
        <div class="ls-meta">
          <span class="ls-theme">signal</span>
        </div>
        <div class="ls-title">${ev.title}</div>
        <div class="ls-bar-row">
          <div class="ls-bar"><div class="ls-bar-fill" style="width:${pct}%"></div></div>
          <div class="ls-dis">${ev.intensity}/5</div>
        </div>
        <div class="ls-data"><span>${ev.source || 'unattributed'}</span></div>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.style.display = 'block';

  const chips = $('orcSourceChips');
  chips.innerHTML = '';
  const seen = new Set();
  gathered.events.forEach(ev=>{
    if(ev.source && !seen.has(ev.source)){
      seen.add(ev.source);
      const c = document.createElement('span');
      c.className = 'ls-filter';
      c.textContent = ev.source;
      chips.appendChild(c);
    }
  });
  $('orcSources').style.display = 'block';
}

function renderHorizonTabs(){
  const wrap = $('orcHorizonTabs');
  wrap.innerHTML = '';
  HORIZONS.forEach(h=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ls-filter' + (h.id===currentHorizon ? ' on' : '');
    b.textContent = h.label;
    b.onclick = ()=>{ currentHorizon = h.id; renderHorizonTabs(); renderForHorizon(); };
    wrap.appendChild(b);
  });
  wrap.style.display = 'flex';
}

function renderForHorizon(){
  if(!state || !state.synthesis) return;
  const hz = state.synthesis.horizons.find(x=>x.horizon===currentHorizon);
  const pct = Math.max(0, Math.min(100, hz.consensusProbability));

  const card = $('orcCard');
  card.innerHTML = `
    <div class="orc-stat">
      <div class="sc-n orc-pct">${pct}%</div>
      <div class="label">Consensus &middot; ${HORIZONS.find(h=>h.id===currentHorizon).label}</div>
      <div class="ls-bar orc-bar"><div class="ls-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div>
      <div class="label-signal" style="margin-bottom:.5rem">The oracle speaks</div>
      <h3>${state.topic || 'The state of the world'}</h3>
      <p class="mono orc-forecast">${hz.forecast}</p>
      <div class="orc-dissent"><span class="who">${hz.dissent.persona} dissents</span> &mdash; ${hz.dissent.objection}</div>
    </div>`;
  card.style.display = 'grid';

  const council = $('orcCouncil');
  council.innerHTML = '';
  state.personaResults.forEach(pr=>{
    const p = PERSONAS.find(x=>x.id===pr.persona);
    const f = pr.data.forecasts.find(x=>x.horizon===currentHorizon);
    const row = document.createElement('div');
    row.className = 'mf-row';
    row.innerHTML = `
      <div class="mf-k">${p.name} &middot; <span class="orc-persona-prob mono-num">${f.probability}%</span></div>
      <div class="mf-v">${f.headline}. ${f.reasoning}</div>`;
    council.appendChild(row);
  });
  council.style.display = 'flex';
}

// ---------- main pipeline ----------
async function runOracle(topic, domains){
  hideError();
  $('orcPipeline').style.display = 'flex';
  $('orcConsultBtn').disabled = true;
  $('orcCard').style.display = 'none';
  $('orcCouncil').style.display = 'none';
  $('orcHorizonTabs').style.display = 'none';
  $('orcTicker').style.display = 'none';
  $('orcSources').style.display = 'none';

  try{
    setStage('sensing', 'Scanning ' + domains.map(id=>DOMAINS.find(d=>d.id===id).label).join(', ') + ' for live signal…');
    const gatherText = await callClaude(gatherPrompt(topic, domains), true);
    const gathered = parseJSONLoose(gatherText);
    renderTicker(gathered);

    setStage('council', 'Five personas deliberating: Analyst, Skeptic, Quant, Historian, Contrarian…');
    const briefText = gathered.summary + '\n' + gathered.events.map(e=>`- [${e.domain}] ${e.title} (${e.source})`).join('\n');
    const personaResults = await Promise.all(PERSONAS.map(async p=>{
      const t = await callClaude(personaPrompt(p, briefText, topic), false);
      return { persona: p.id, data: parsePersonaResponse(t) };
    }));

    setStage('oracle', 'Synthesizing consensus and dissent into a forecast…');
    const synthText = await callClaude(synthesisPrompt(personaResults, topic), false);
    const synthesis = parseSynthesisResponse(synthText);

    setStage('oracle', 'Done.');
    state = { topic, domains, gathered, personaResults, synthesis, ts: Date.now() };
    currentHorizon = '24h';
    renderHorizonTabs();
    renderForHorizon();
    saveAugury(state);
    renderPastList();
  }catch(err){
    showError(err.message || 'Something interrupted the reading.');
  }finally{
    $('orcConsultBtn').disabled = false;
  }
}

$('orcConsultBtn').onclick = ()=>{
  const topic = $('orcTopicInput').value.trim();
  const domains = Array.from(activeDomains);
  if(domains.length === 0){ showError('Select at least one domain to scan.'); return; }
  lastRunArgs = { topic, domains };
  runOracle(topic, domains);
};
$('orcTopicInput').addEventListener('keydown', e=>{ if(e.key === 'Enter') $('orcConsultBtn').click(); });
$('orcRetryBtn').onclick = ()=>{ if(lastRunArgs) runOracle(lastRunArgs.topic, lastRunArgs.domains); };

// ---------- persistence (localStorage — this is a live static site, not a sandboxed artifact) ----------
function loadAuguries(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }catch(e){ return []; }
}
function saveAugury(s){
  try{
    const list = loadAuguries();
    list.unshift(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0,20)));
  }catch(e){ /* storage unavailable — non-fatal */ }
}
function renderPastList(){
  const listEl = $('orcPastList');
  const items = loadAuguries();
  if(items.length === 0){
    listEl.innerHTML = '<div class="orc-past-empty">No past auguries yet on this device.</div>';
    return;
  }
  listEl.innerHTML = '';
  items.forEach(item=>{
    const d = new Date(item.ts);
    const el = document.createElement('div');
    el.className = 'sesh';
    el.innerHTML = `<span class="sesh-name">${item.topic || 'Global scan'}</span><span class="sesh-dur">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>`;
    el.onclick = ()=>{
      state = item;
      activeDomains = new Set(item.domains);
      renderDomainChips();
      $('orcTopicInput').value = item.topic || '';
      currentHorizon = '24h';
      $('orcPipeline').style.display = 'flex';
      setStage('oracle', 'Recalled from past auguries.');
      renderTicker(item.gathered);
      renderHorizonTabs();
      renderForHorizon();
      document.getElementById('oracle').scrollIntoView({ behavior:'smooth', block:'start' });
    };
    listEl.appendChild(el);
  });
}
$('orcPastToggle').onclick = ()=>{
  $('orcPastToggle').classList.toggle('open');
  $('orcPastList').classList.toggle('open');
};

renderPastList();

})();
