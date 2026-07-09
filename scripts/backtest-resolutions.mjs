#!/usr/bin/env node
// scripts/backtest-resolutions.mjs
//
// Backtests the resolution agent's research capability against KNOWN
// historical windows, before trusting it on live calls. For each of the
// 5 standing questions, constructs synthetic calls dated 1, 2, 3, and 4
// months back (20 cases total) and runs the same research loop
// resolve-calls.mjs uses, against hand-written, date-injected resolution
// criteria.
//
// What this tests: can the agent actually FIND the specific published
// figures (HY OAS levels, CPI prints, ETF flows, VIX vs its trailing
// average) via web search, and does it judge them correctly against
// pre-set criteria?
//
// What this deliberately does NOT test: synthesis-written criteria
// quality (criteria here are hand-written so research capability is
// isolated), and live-data freshness (historical windows are published
// and indexed; live resolution can be harder). A strong backtest is
// necessary but not sufficient; a weak one is damning.
//
// Design decisions:
//   - KEY_FIGURES is mandatory: the agent must state the actual numbers
//     it found, with dates — that's what makes results human-verifiable,
//     and an agent that can't name figures is itself a finding.
//   - UNRESOLVABLE is an allowed outcome: the agent may say "couldn't
//     find this data" rather than being forced to guess. Never saying it
//     is suspicious; saying it often is the failure mode we're hunting.
//   - Writes ONLY to data/backtest-results.json. Never touches
//     calls.json, resolution-drafts.json, or track-record.json.
//   - Each case carries an empty `review` block for human verification.
//
// Run manually:  ANTHROPIC_API_KEY=... node scripts/backtest-resolutions.mjs
// Or via the workflow_dispatch-only backtest workflow.

const API_KEY = process.env.ANTHROPIC_API_KEY;
if(!API_KEY){
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

// ---------- date helpers (all UTC, day precision) ----------
function daysAgo(n){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function iso(d){ return d.toISOString().slice(0, 10); }
function addDays(d, n){
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

const HORIZON_DAYS = { '1w': 7, '1m': 30 };

// ---------- case construction ----------
// Each question gets a criteria template with {start} and {end} injected,
// written to name the comparator and the source category explicitly —
// the same standard the live criteria are held to.
const QUESTION_TEMPLATES = [
  {
    id: 'macro',
    domain: 'Macro Health & Sentiment',
    horizon: '1m',
    question: (s, e) => `Did both US CPI and Eurozone HICP (headline, year-over-year) come in higher at their releases during ${s} to ${e} than their prior month's readings?`,
    criteria: (s, e) => `Resolves YES if the US CPI YoY print and the Eurozone HICP flash/final YoY print published between ${s} and ${e} were BOTH higher than the respective prior month's readings (check BLS releases for CPI, Eurostat for HICP). Resolves NO if either was flat or lower. Resolves PARTIAL only if one accelerated and the other's reading is genuinely disputed or revised ambiguously.`
  },
  {
    id: 'markets',
    domain: 'Financial & Capital Markets',
    horizon: '1m',
    question: (s, e) => `Was the ICE BofA US High Yield Index Option-Adjusted Spread wider on ${e} than on ${s}?`,
    criteria: (s, e) => `Resolves YES if the ICE BofA US High Yield Index Option-Adjusted Spread (FRED series BAMLH0A0HYM2) closing value on ${e} (or nearest prior business day) was higher than on ${s} (or nearest prior business day). Resolves NO if equal or lower. State both values with their exact dates.`
  },
  {
    id: 'crypto',
    domain: 'Crypto Market Dynamics',
    horizon: '1w',
    question: (s, e) => `Did US-listed spot Bitcoin ETFs register net inflows over the 7 days from ${s} to ${e}?`,
    criteria: (s, e) => `Resolves YES if aggregate net flows across all US-listed spot Bitcoin ETFs summed over ${s} to ${e} were positive (check flow trackers such as Farside Investors or SoSoValue). Resolves NO if net negative. State the approximate net figure in USD.`
  },
  {
    id: 'geopolitics',
    domain: 'Geopolitical, Policy & Regulatory',
    horizon: '1m',
    question: (s, e) => `Was the CBOE Volatility Index (VIX) on ${e} higher than its trailing 3-month average as of that date?`,
    criteria: (s, e) => `Resolves YES if the VIX closing value on ${e} (or nearest prior trading day) was above the average of its daily closes over the 3 months ending ${e}. Resolves NO if at or below. State the closing value and the trailing average you computed or found.`
  },
  {
    id: 'ai',
    domain: 'Frontier AI & Energy',
    horizon: '1m',
    question: (s, e) => `Did a major hyperscaler or AI lab announce a new dedicated power-generation or power-purchase agreement for AI/data-center capacity between ${s} and ${e}?`,
    criteria: (s, e) => `Resolves YES if at least one announcement of a new dedicated power-generation project or power-purchase agreement for AI/data-center capacity by a major hyperscaler (e.g. Microsoft, Google, Amazon, Meta) or AI lab was made between ${s} and ${e} (check energy trade press and company announcements). Resolves NO if none. Name the specific deal(s), parties, and announcement date(s).`
  }
];

const LOOKBACK_MONTHS = [1, 2, 3, 4];
const LOOKBACK_WEEKS = [1, 2, 3, 4];

function buildCases(){
  const cases = [];
  for(const t of QUESTION_TEMPLATES){
    // Crypto (1w horizon) backtests weekly; everything else monthly
    const lookbacks = t.horizon === '1w'
      ? LOOKBACK_WEEKS.map(w => ({ n: w, days: w * 7, label: `${w}w` }))
      : LOOKBACK_MONTHS.map(m => ({ n: m, days: m * 30, label: `${m}m` }));

    for(const lb of lookbacks){
      const calledAt = daysAgo(lb.days);
      const resolvesAt = addDays(calledAt, HORIZON_DAYS[t.horizon]);
      const s = iso(calledAt), e = iso(resolvesAt);
      cases.push({
        caseId: `${t.id}_${lb.label}`,
        domain: t.domain,
        question: t.question(s, e),
        lookbackLabel: lb.label,
        horizon: t.horizon,
        window: { calledAt: s, resolvesAt: e },
        resolutionCriteria: t.criteria(s, e)
      });
    }
  }
  return cases;
}

// ---------- API ----------
async function callClaude(promptText){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptText }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    })
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

// Same delimited-field parsing as the rest of the pipeline — no JSON.
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

function backtestPrompt(c){
  return `You are the resolution layer of a forecasting system, being backtested against a historical window whose outcome is already knowable. Research what actually happened and judge it strictly against the criteria below — do not re-interpret the question.

Question: "${c.question}" (domain: ${c.domain})
Resolution window: ${c.window.calledAt} to ${c.window.resolvesAt}
Resolution criteria: ${c.resolutionCriteria}

Use web search — run as many searches as you actually need, checking multiple sources where the picture is unclear — to find the real historical figures. You MUST state the specific numbers you found, with their dates. If, after genuinely trying, you cannot find the specific data the criteria require, say so honestly with outcome UNRESOLVABLE rather than guessing — an honest "couldn't find it" is a valid and useful result here.

Respond in EXACTLY this plain-text format, one field per line, nothing before or after it, no JSON, no markdown, no quotation marks wrapping values:
OUTCOME: <one of exactly: YES, NO, PARTIAL, UNRESOLVABLE>
KEY_FIGURES: <the specific numbers/facts you found, each with its date and where it came from — the raw evidence, not interpretation>
EVIDENCE: <2-4 sentences: how those figures map onto the resolution criteria>
SOURCES: <comma-separated publication or site names you actually drew from>`;
}

async function runOne(c){
  console.log(`[${c.caseId}] researching window ${c.window.calledAt} \u2192 ${c.window.resolvesAt}...`);
  const text = await callClaude(backtestPrompt(c));
  const fields = parseFields(text, ['OUTCOME', 'KEY_FIGURES', 'EVIDENCE', 'SOURCES']);
  const outcomeRaw = (fields.outcome || '').toUpperCase();
  const outcome = ['YES', 'NO', 'PARTIAL', 'UNRESOLVABLE'].includes(outcomeRaw)
    ? outcomeRaw.toLowerCase()
    : 'unresolvable';

  return {
    ...c,
    proposedOutcome: outcome,
    keyFigures: fields.key_figures,
    evidenceSummary: fields.evidence,
    sources: (fields.sources || '').split(',').map(s => s.trim()).filter(Boolean),
    review: { humanVerdict: null, figuresCorrect: null, notes: '' }
  };
}

async function main(){
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outPath = path.join(process.cwd(), 'data', 'backtest-results.json');

  const cases = buildCases();
  console.log(`Running ${cases.length} backtest cases (${QUESTION_TEMPLATES.length} domains \u00d7 ${LOOKBACK_MONTHS.length} lookbacks)...`);

  const results = [];
  for(const c of cases){
    try{
      results.push(await runOne(c));
    }catch(e){
      console.error(`[${c.caseId}] failed: ${e.message}`);
      results.push({
        ...c,
        proposedOutcome: 'error',
        keyFigures: '',
        evidenceSummary: `Run failed: ${e.message}`,
        sources: [],
        review: { humanVerdict: null, figuresCorrect: null, notes: '' }
      });
    }
  }

  const summary = {};
  for(const r of results){
    summary[r.proposedOutcome] = (summary[r.proposedOutcome] || 0) + 1;
  }

  await fs.writeFile(outPath, JSON.stringify({ runAt: new Date().toISOString(), summary, cases: results }, null, 2) + '\n');
  console.log(`\nWrote ${results.length} cases to data/backtest-results.json`);
  console.log('Outcome distribution:', JSON.stringify(summary));
  console.log('\nNext step: human verification \u2014 spot-check KEY_FIGURES against the real data (FRED, BLS, Eurostat, flow trackers) and fill in each case\u2019s review block.');
}

main().catch(e => { console.error(e); process.exit(1); });
