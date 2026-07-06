#!/usr/bin/env node
// scripts/resolve-calls.mjs
//
// For every active call in data/calls.json whose horizon has passed,
// runs a research loop against its pre-set resolution criteria and
// writes a draft verdict to data/resolution-drafts.json.
//
// This NEVER writes to data/track-record.json and NEVER removes
// anything from data/calls.json — those are the Desk's job, and the
// Desk only acts on a human clicking Approve or Decline. What this
// script does is closer to: "thought -> search -> observe -> draft an
// answer" — the same shape as the Oracle's own pipeline, aimed at
// research instead of forecasting.
//
// Safe to re-run: a call that already has a pending draft is skipped,
// so this can run on the same daily schedule as generate-calls.mjs
// without re-researching something already waiting on the Desk.

const API_KEY = process.env.ANTHROPIC_API_KEY;
if(!API_KEY){
  console.error('ANTHROPIC_API_KEY is not set. Set it as a repo secret.');
  process.exit(1);
}

const HORIZON_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '1w':  7 * 24 * 60 * 60 * 1000,
  '1m':  30 * 24 * 60 * 60 * 1000,
  '1y':  365 * 24 * 60 * 60 * 1000
};

async function callClaude(promptText, useSearch){
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: 1200,
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

// Same field-extraction approach as generate-calls.mjs — no JSON, so no
// escaping failure mode. See that file's comment for why.
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

function resolvePrompt(call){
  return `You are the resolution layer of a forecasting swarm. A standing call was made and its horizon has now passed. Your job is to find out what actually happened and judge it strictly against the criteria that were set in advance — not to re-interpret the question, and not to be swayed by how confident the original forecast sounded.

Question: "${call.question}" (domain: ${call.domain})
Original forecast, made on ${call.calledAt}: ${call.probability}% \u2014 ${call.forecast}
Resolution criteria, decided before any outcome was known: ${call.resolutionCriteria}
Horizon: ${call.horizon}

Think step by step about what specific facts would settle this. Use web search \u2014 run as many searches as you actually need, checking multiple sources where the picture is unclear \u2014 to find the real, current outcome. Then decide.

Respond in EXACTLY this plain-text format, one field per line, nothing before or after it, no JSON, no markdown, no quotation marks wrapping values:
OUTCOME: <one of exactly: YES, NO, PARTIAL>
EVIDENCE: <2-4 sentences: what you found, and specifically how it maps to the resolution criteria above>
SOURCES: <comma-separated publication or site names you actually drew from>`;
}

async function resolveOne(call){
  console.log(`[${call.id}] researching resolution...`);
  const text = await callClaude(resolvePrompt(call), true);
  const fields = parseFields(text, ['OUTCOME', 'EVIDENCE', 'SOURCES']);
  const outcomeRaw = (fields.outcome || '').toUpperCase();
  const outcome = ['YES', 'NO', 'PARTIAL'].includes(outcomeRaw) ? outcomeRaw.toLowerCase() : 'partial';

  return {
    id: call.id,
    domain: call.domain,
    question: call.question,
    resolutionCriteria: call.resolutionCriteria,
    calledAt: call.calledAt,
    calledProbability: call.probability,
    horizon: call.horizon,
    researchedAt: new Date().toISOString(),
    proposedOutcome: outcome,
    evidenceSummary: fields.evidence,
    sources: (fields.sources || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}

async function main(){
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const callsPath = path.join(process.cwd(), 'data', 'calls.json');
  const draftsPath = path.join(process.cwd(), 'data', 'resolution-drafts.json');

  const calls = await fs.readFile(callsPath, 'utf8').then(JSON.parse).catch(() => ({ calls: [] }));
  const drafts = await fs.readFile(draftsPath, 'utf8').then(JSON.parse).catch(() => ({ drafts: [] }));

  const activeCalls = calls.calls || [];
  const existingDrafts = drafts.drafts || [];
  const now = Date.now();

  const due = activeCalls.filter(c => {
    if(existingDrafts.find(d => d.id === c.id)) return false; // already awaiting review
    const calledAt = new Date(c.calledAt || 0).getTime();
    const ms = HORIZON_MS[c.horizon] || HORIZON_MS['1m'];
    return calledAt && (now - calledAt) >= ms;
  });

  if(due.length === 0){
    console.log('No calls past their horizon without an existing draft. Nothing to do.');
    return;
  }

  const newDrafts = [];
  for(const call of due){
    try{
      newDrafts.push(await resolveOne(call));
    }catch(e){
      console.error(`[${call.id}] resolution research failed:`, e.message);
      // leave it — next run will retry since no draft was written for it
    }
  }

  if(newDrafts.length === 0){
    console.log('All resolution attempts failed this run — nothing written.');
    return;
  }

  const merged = existingDrafts.concat(newDrafts);
  await fs.writeFile(draftsPath, JSON.stringify({ drafts: merged }, null, 2) + '\n');
  console.log(`Drafted ${newDrafts.length} resolution(s), awaiting review on the Desk. ${merged.length} draft(s) pending total.`);
}

main().catch(e => { console.error(e); process.exit(1); });
