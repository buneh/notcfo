#!/usr/bin/env node
// scripts/generate-calls.mjs
//
// Runs the same gather -> council -> synthesis pipeline as the Oracle
// section, but headless, on a fixed set of standing questions (one per
// notcfo domain), and writes the result to data/calls.json.
//
// Triggered by .github/workflows/generate-calls.yml on a schedule, using
// ANTHROPIC_API_KEY as a repo secret. Requires Node 18+ (built-in fetch).
// No npm dependencies.
//
// Resolving a call (deciding whether it came true) is deliberately NOT
// automated here — that's a human judgment step. See data/track-record.json
// and move a call there by hand once you're ready to score it.

const API_KEY = process.env.ANTHROPIC_API_KEY;
if(!API_KEY){
  console.error('ANTHROPIC_API_KEY is not set. Set it as a repo secret.');
  process.exit(1);
}

// ---- one standing question per domain, one horizon each ----
// Edit this list any time — it drives everything below.
const STANDING_QUESTIONS = [
  {
    id: 'dcm',
    domain: 'DCM',
    question: 'Will CEE/CIS primary bond issuance volume increase over the next month?',
    horizon: '1m'
  },
  {
    id: 'defi',
    domain: 'Agentic AI & Crypto',
    question: 'Will total value locked in agentic-managed DeFi strategies grow over the next week?',
    horizon: '1w'
  },
  {
    id: 'fintech',
    domain: 'Telecom \u00d7 FinTech',
    question: 'Will telecom-embedded financial services see a major new partnership or launch this month?',
    horizon: '1m'
  },
  {
    id: 'signal',
    domain: 'Signal Intelligence',
    question: 'Will discussion intensity around AI regulation increase over the next week?',
    horizon: '1w'
  }
];

const PERSONAS = [
  { id:'analyst', name:'The Analyst', lens:'Ground every claim in comparable historical frequencies and observable current data. Avoid speculation and hedging language.' },
  { id:'skeptic', name:'The Skeptic', lens:'Actively look for reasons the obvious reading could be wrong. Question the framing of the question itself and what could be missing from the signal.' },
  { id:'quant', name:'The Quant', lens:'Think in explicit probability terms. Reference base rates and how you would update on new information. Be numerically precise.' },
  { id:'historian', name:'The Historian', lens:'Draw on the closest historical analogues to this situation and how those resolved. Ground reasoning in precedent.' },
  { id:'contrarian', name:'The Contrarian', lens:"Argue for the scenario consensus is most likely underpricing, even if uncomfortable or low-probability. Find the tail risk." }
];

async function callClaude(promptText, useSearch){
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: promptText }]
  };
  if(useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if(!text) throw new Error('Empty response from model');
  return text;
}

function parseJSONLoose(text){
  let cleaned = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if(start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

function gatherPrompt(q){
  return `You are the sensing layer of a forecasting council. Use web search to find current real information (last few days) relevant to this question: "${q.question}" (domain: ${q.domain}).
Return ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{"summary":"one plain paragraph describing the current state relevant to the question"}
Do not include any text outside the JSON object.`;
}

function personaPrompt(persona, q, summary){
  return `You are ${persona.name}, a member of a five-person forecasting council. Your lens: ${persona.lens}
World-state brief: ${summary}
Question: "${q.question}"
Produce a single forecast for the ${q.horizon} horizon only.
Respond with ONLY valid JSON, no markdown, no commentary, matching exactly:
{"probability":0-100,"headline":"under 12 words, concrete claim","reasoning":"one to two sentences, in character"}
The "probability" is the likelihood of the headline claim being true by that horizon. Be specific and concrete, avoid hedging.`;
}

function synthesisPrompt(q, personaResults){
  const block = personaResults.map(pr => {
    const p = PERSONAS.find(x => x.id === pr.persona);
    return `${p.name}: ${pr.data.probability}% \u2014 ${pr.data.headline} (${pr.data.reasoning})`;
  }).join('\n');
  return `You are the Oracle's voice, synthesizing a forecasting council. Question: "${q.question}" (horizon: ${q.horizon})
Council forecasts:
${block}
Compute a consensus probability weighing all five views, and write one short grounded forecast paragraph (2-3 sentences, plain language).
Respond with ONLY valid JSON, no markdown, no commentary, matching exactly:
{"probability":0-100,"forecast":"..."}`;
}

async function generateOne(q){
  console.log(`[${q.id}] sensing...`);
  const gatherText = await callClaude(gatherPrompt(q), true);
  const { summary } = parseJSONLoose(gatherText);

  console.log(`[${q.id}] convening council...`);
  const personaResults = await Promise.all(PERSONAS.map(async p => {
    const t = await callClaude(personaPrompt(p, q, summary), false);
    return { persona: p.id, data: parseJSONLoose(t) };
  }));

  console.log(`[${q.id}] synthesizing...`);
  const synthText = await callClaude(synthesisPrompt(q, personaResults), false);
  const synth = parseJSONLoose(synthText);

  return {
    id: q.id,
    domain: q.domain,
    question: q.question,
    horizon: q.horizon,
    probability: Math.max(0, Math.min(100, Math.round(synth.probability))),
    forecast: synth.forecast
  };
}

async function main(){
  const calls = [];
  for(const q of STANDING_QUESTIONS){
    try{
      calls.push(await generateOne(q));
    }catch(e){
      console.error(`[${q.id}] failed:`, e.message);
      // skip this domain rather than fail the whole run — the last good
      // value for this domain simply won't be refreshed this cycle.
    }
  }

  if(calls.length === 0){
    console.error('All domains failed — not overwriting data/calls.json.');
    process.exit(1);
  }

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outPath = path.join(process.cwd(), 'data', 'calls.json');
  const existing = await fs.readFile(outPath, 'utf8').then(JSON.parse).catch(() => ({ calls: [] }));

  // keep any domain not refreshed this run (partial failure) rather than dropping it
  const byId = new Map(calls.map(c => [c.id, c]));
  const merged = STANDING_QUESTIONS.map(q => byId.get(q.id) || (existing.calls || []).find(c => c.id === q.id)).filter(Boolean);

  await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), calls: merged }, null, 2) + '\n');
  console.log(`Wrote ${merged.length} calls to data/calls.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
