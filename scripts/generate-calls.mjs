#!/usr/bin/env node
// scripts/generate-calls.mjs
//
// EXPERIMENTAL: 50-persona version, single flat synthesis pass.
//
// This is explicitly a test of whether one synthesis call can handle 50
// persona outputs directly, before building the (probably necessary)
// hierarchical two-pass aggregation. Worth being clear about what this
// is NOT: 50 personas is a larger ensemble, not emergent swarm behavior —
// it's still one model, prompted 50 different ways. The two things that
// make this a real test of differentiation rather than 50 cosmetically
// different names on the same output:
//
//   1. Five reasoning METHODOLOGIES (how a persona reasons) crossed with
//      ten evidence LENSES (what a persona is told to weight) = 50
//      genuinely distinct (methodology, evidence) pairs, not 50 arbitrary
//      personalities.
//   2. Sensing now gathers a CATEGORIZED brief (one section per evidence
//      lens) instead of one flat paragraph — so the 10 evidence lenses
//      actually differ in what they're looking at, not just how a single
//      shared paragraph is described. Still one web-search call (cost
//      control), not ten.
//
// Personas are explicitly permitted to say their lens had nothing
// substantive to go on (INSUFFICIENT_EVIDENCE), rather than being
// pressured into inventing relevance — the failure mode of scaling
// personas without this is 50 confident-sounding hallucinations instead
// of 5.
//
// Calls are still discrete commitments: this script only fills an empty
// slot, never overwrites an active call. See prior version's comments
// for that behavior; unchanged here.

const API_KEY = process.env.ANTHROPIC_API_KEY;
if(!API_KEY){
  console.error('ANTHROPIC_API_KEY is not set. Set it as a repo secret.');
  process.exit(1);
}

// ---- one standing question per domain, one horizon each ----
const STANDING_QUESTIONS = [
  {
    id: 'macro',
    domain: 'Macro Health & Sentiment',
    question: 'Will both US CPI and Eurozone HICP (headline, year-over-year) come in higher at their next releases than their prior month\u2019s readings?',
    horizon: '1m'
  },
  {
    id: 'markets',
    domain: 'Financial & Capital Markets',
    question: 'Will the ICE BofA US High Yield Index Option-Adjusted Spread be wider in 30 days than it is today?',
    horizon: '1m'
  },
  {
    id: 'crypto',
    domain: 'Crypto Market Dynamics',
    question: 'Will US-listed spot Bitcoin ETFs register net inflows over the next 7 days?',
    horizon: '1w'
  },
  {
    id: 'geopolitics',
    domain: 'Geopolitical, Policy & Regulatory',
    question: 'Will the CBOE Volatility Index (VIX) be higher in 30 days than its trailing 3-month average?',
    horizon: '1m'
  },
  {
    id: 'ai',
    domain: 'Frontier AI & Energy',
    question: 'Will a major hyperscaler or AI lab announce a new dedicated power-generation or power-purchase agreement for AI/data-center capacity within 30 days?',
    horizon: '1m'
  }
];

// ---- 5 reasoning methodologies (HOW a persona reasons) ----
const METHODOLOGIES = [
  { id: 'analyst',    name: 'Analyst',    lens: 'Ground every claim in comparable historical frequencies and observable current data. Avoid speculation and hedging language.' },
  { id: 'skeptic',    name: 'Skeptic',    lens: 'Actively look for reasons the obvious reading could be wrong. Question the framing of the question itself and what could be missing.' },
  { id: 'quant',      name: 'Quant',      lens: 'Think in explicit probability terms. Reference base rates and how you would update on new information. Be numerically precise.' },
  { id: 'historian',  name: 'Historian',  lens: 'Draw on the closest historical analogues to this situation and how those resolved. Ground reasoning in precedent.' },
  { id: 'contrarian', name: 'Contrarian', lens: "Argue for the scenario consensus is most likely underpricing, even if uncomfortable or low-probability. Find the tail risk." }
];

// ---- 10 evidence lenses (WHAT a persona is told to weight) ----
// Each id matches a section marker in the categorized Sensing brief below.
const EVIDENCE_LENSES = [
  { id: 'OFFICIAL',    name: 'Official Data',       desc: 'government releases, central bank data, regulatory filings' },
  { id: 'MARKET',      name: 'Market Pricing',      desc: 'yields, spreads, token prices, trading volumes' },
  { id: 'DEALFLOW',    name: 'Deal Flow',           desc: 'press releases, announcements, deal terms' },
  { id: 'EXPERT',      name: 'Expert Commentary',   desc: 'sell-side research, named analyst quotes' },
  { id: 'SOCIAL',      name: 'Social Discourse',    desc: 'what\u2019s being actively argued across public discussion' },
  { id: 'HISTORICAL',  name: 'Historical Precedent', desc: 'prior analogous cycles and how they resolved' },
  { id: 'PRACTITIONER',name: 'Practitioner Accounts', desc: 'trade press, conference commentary, insider perspective' },
  { id: 'ANALOGY',     name: 'Cross-Domain Analogy', desc: 'parallels from a structurally similar but unrelated field' },
  { id: 'COMPETITIVE', name: 'Peer Benchmarking',   desc: 'what comparable entities are doing' },
  { id: 'ACADEMIC',    name: 'Academic Literature',  desc: 'published papers, working papers' }
];

// 5 x 10 = 50 personas, each one clean (methodology, evidence lens) pair.
const PERSONAS = METHODOLOGIES.flatMap(m =>
  EVIDENCE_LENSES.map(e => ({
    id: `${m.id}_${e.id.toLowerCase()}`,
    name: `${m.name} \u00b7 ${e.name}`,
    methodology: m,
    evidence: e
  }))
);

async function callClaude(promptText, useSearch, maxTokens){
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: maxTokens || 1000,
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

// Runs async fn over items with at most `limit` in flight at once — 50
// fully-parallel requests in one burst is worth avoiding regardless of
// rate limits; this just runs in batches instead.
async function runWithConcurrency(items, limit, fn){
  const results = [];
  for(let i = 0; i < items.length; i += limit){
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// Field/block extraction — no JSON anywhere in this pipeline. See git
// history for why: two separate real failures (an unescaped newline,
// then an unescaped quote) from asking a model to hand-produce valid
// JSON around free text. Plain labeled text needs no escaping at all.
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

function parseBlocks(text, markerIds){
  const pattern = new RegExp('===\\s*(' + markerIds.join('|') + ')\\s*===', 'gi');
  const parts = text.split(pattern);
  const blocks = {};
  for(let i = 1; i < parts.length; i += 2){
    blocks[parts[i].toUpperCase()] = (parts[i + 1] || '').trim();
  }
  return blocks;
}

function gatherPrompt(q){
  const categoryList = EVIDENCE_LENSES.map(e => `===${e.id}===\n<${e.desc}, or "Limited/no direct signal found" if genuinely nothing substantive turned up>`).join('\n');
  return `You are the sensing layer of a forecasting council. Use web search to find current real information (last few days) relevant to this question: "${q.question}" (domain: ${q.domain}).
Organize what you find into these categories. For any category where nothing substantive turned up, write exactly "Limited/no direct signal found" for that section rather than padding it with unrelated content \u2014 an honest gap is more useful than manufactured relevance.
Respond in EXACTLY this plain-text format, no JSON, no markdown, nothing before or after it:
${categoryList}`;
}

function personaPrompt(persona, q, briefBlocks){
  const ownSection = briefBlocks[persona.evidence.id] || 'Limited/no direct signal found';
  const fullBrief = EVIDENCE_LENSES.map(e => `${e.name}: ${briefBlocks[e.id] || 'Limited/no direct signal found'}`).join('\n');
  return `You are one voice in a 50-member forecasting council. You have two assigned roles that must both shape your answer:
METHODOLOGY (how you reason) \u2014 ${persona.methodology.name}: ${persona.methodology.lens}
EVIDENCE LENS (what you weight most) \u2014 ${persona.evidence.name}: focus primarily on this section of the brief: "${ownSection}"

Full brief, for context, organized by category:
${fullBrief}

Question: "${q.question}"
Produce a single forecast for the ${q.horizon} horizon only, reasoning through your methodology and weighting your assigned evidence lens's section most heavily. If your lens's section says "Limited/no direct signal found" or is otherwise thin, say so plainly in INSUFFICIENT_EVIDENCE rather than inventing relevance from the other sections.
Respond in EXACTLY this plain-text format, one field per line, nothing before or after it, no JSON, no markdown, no quotation marks wrapping values:
PROBABILITY: <integer 0-100>
HEADLINE: <under 12 words, concrete claim>
REASONING: <one to two sentences, using your methodology and evidence lens>
INSUFFICIENT_EVIDENCE: <YES if your lens's section had nothing substantive to go on, otherwise NO>`;
}

function synthesisPrompt(q, personaResults){
  const block = personaResults.map(pr => {
    const flag = pr.data.insufficientEvidence === 'YES' ? ' [thin evidence]' : '';
    return `${pr.persona.name}: ${pr.data.probability}%${flag} \u2014 ${pr.data.headline} (${pr.data.reasoning})`;
  }).join('\n');
  return `You are the Oracle's voice, synthesizing a 50-member forecasting council for a single call. Question: "${q.question}" (horizon: ${q.horizon})
Council forecasts (50 voices, each tagged with the methodology and evidence lens they used; entries marked [thin evidence] said their assigned evidence lens had little to go on \u2014 weight those less heavily than substantiated ones):
${block}
Compute a consensus probability weighing all voices \u2014 discount [thin evidence] entries rather than treating every voice as equally informative. State the FORECAST as a single, concise verdict, not a narrative paragraph: one sentence, under 25 words, stating the expected outcome plainly and directly. No hedging filler, no restating the question, no listing every consideration \u2014 the verdict only.
Also write the resolution criteria for this call NOW, before anyone knows the outcome. State a concrete comparator \u2014 a trailing average, a named index, or a specific published figure \u2014 rather than a vague direction, and name the kind of source that should be checked. Do not use subjective words like "major" or "significant"; replace them with a specific threshold. This is what makes the call verifiable later as true or false \u2014 be precise enough that someone else could check it with no further judgment call.
Respond in EXACTLY this plain-text format, one field per line, nothing before or after it, no JSON, no markdown, no quotation marks wrapping values:
PROBABILITY: <integer 0-100>
FORECAST: <one sentence, under 25 words \u2014 the verdict, not a discussion>
RESOLUTION_CRITERIA: <one to two sentences: resolves YES if ___ (name the comparator/source); resolves NO if ___>`;
}

async function generateOne(q){
  console.log(`[${q.id}] sensing (categorized, ${EVIDENCE_LENSES.length} sections)...`);
  const gatherText = await callClaude(gatherPrompt(q), true, 1500);
  const briefBlocks = parseBlocks(gatherText, EVIDENCE_LENSES.map(e => e.id));

  console.log(`[${q.id}] convening 50-member council...`);
  const rawResults = await runWithConcurrency(PERSONAS, 8, async p => {
    try{
      const t = await callClaude(personaPrompt(p, q, briefBlocks), false);
      const fields = parseFields(t, ['PROBABILITY', 'HEADLINE', 'REASONING', 'INSUFFICIENT_EVIDENCE']);
      return {
        persona: p,
        data: {
          probability: parseInt(fields.probability, 10) || 50,
          headline: fields.headline,
          reasoning: fields.reasoning,
          insufficientEvidence: (fields.insufficient_evidence || '').toUpperCase().startsWith('Y') ? 'YES' : 'NO'
        }
      };
    }catch(e){
      // A single persona failing (transient blip, empty response, etc.) should
      // drop that one voice, not the whole domain — Promise.all inside
      // runWithConcurrency fails its whole batch on any one rejection, so this
      // catch has to live here, per-call, not around the batch.
      console.error(`[${q.id}]   ${p.name} failed: ${e.message}`);
      return null;
    }
  });

  const personaResults = rawResults.filter(Boolean);
  const droppedCount = PERSONAS.length - personaResults.length;
  if(droppedCount > 0){
    console.log(`[${q.id}] ${droppedCount}/${PERSONAS.length} voices failed outright and were dropped`);
  }
  const MIN_QUORUM = 25; // at least half the council actually responded
  if(personaResults.length < MIN_QUORUM){
    throw new Error(`Only ${personaResults.length}/${PERSONAS.length} voices succeeded \u2014 too few for a reliable synthesis`);
  }

  const thinCount = personaResults.filter(pr => pr.data.insufficientEvidence === 'YES').length;
  console.log(`[${q.id}] ${thinCount}/${personaResults.length} responding voices flagged thin evidence for their lens`);

  console.log(`[${q.id}] synthesizing (single flat pass across all 50)...`);
  const synthText = await callClaude(synthesisPrompt(q, personaResults), false, 1500);
  const synthFields = parseFields(synthText, ['PROBABILITY', 'FORECAST', 'RESOLUTION_CRITERIA']);
  const probability = parseInt(synthFields.probability, 10);

  const now = new Date().toISOString();
  return {
    id: q.id,
    domain: q.domain,
    question: q.question,
    horizon: q.horizon,
    probability: Math.max(0, Math.min(100, Number.isFinite(probability) ? Math.round(probability) : 50)),
    forecast: synthFields.forecast,
    resolutionCriteria: synthFields.resolution_criteria,
    calledAt: now,
    // kept for this experimental run only, not rendered by calls.js —
    // useful for eyeballing whether the 50-voice/flat-synthesis test
    // actually produced a sensible read before building the two-pass version
    _debug: { personaCount: PERSONAS.length, respondedCount: personaResults.length, droppedCount, thinEvidenceCount: thinCount }
  };
}

async function main(){
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outPath = path.join(process.cwd(), 'data', 'calls.json');
  const existing = await fs.readFile(outPath, 'utf8').then(JSON.parse).catch(() => ({ calls: [] }));
  const existingCalls = existing.calls || [];

  const openSlots = STANDING_QUESTIONS.filter(q => !existingCalls.find(c => c.id === q.id));

  if(openSlots.length === 0){
    console.log('All four domains already have an active call \u2014 nothing to generate this run.');
    return;
  }

  const generated = [];
  for(const q of openSlots){
    try{
      generated.push(await generateOne(q));
    }catch(e){
      console.error(`[${q.id}] failed:`, e.message);
    }
  }

  if(generated.length === 0){
    console.log('All generation attempts failed this run \u2014 nothing written.');
    return;
  }

  const merged = existingCalls.concat(generated);
  await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), calls: merged }, null, 2) + '\n');
  console.log(`Filled ${generated.length}/${openSlots.length} open slot(s) using the 50-persona / single-synthesis test path.`);
}

main().catch(e => { console.error(e); process.exit(1); });
