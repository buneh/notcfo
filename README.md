# notcfo

An agentic forecasting and opinion engine — live at [notcfo.com](https://notcfo.com).

notcfo runs two independent forecasting systems in the open, publishes
their reasoning and resolution criteria before outcomes are known, and
keeps a permanent public track record of every call, right or wrong.
Built and maintained by Shota Zhvania (20+ years in debt capital
markets) working alongside a forecasting swarm — the human half and the
machine half, both named, neither hidden. The scheduled machine half is
a Grok swarm: one live search, five independent ballots, and a median
computed in code. The speaker writes the sentence. It does not move the
number.

## What's actually running

**Sensing** is the shared foundation: an autonomous web search gathers
current information per domain, organized into ten categories (official
data, market pricing, deal flow, expert commentary, social discourse,
historical precedent, practitioner accounts, cross-domain analogy, peer
benchmarking, academic literature) rather than one vague summary.

- **The Oracle** — on-demand, visitor-triggered, using the visitor's own
  Anthropic API key. Five independent reasoning personas (Analyst,
  Skeptic, Quant, Historian, Contrarian) forecast with no cross-talk,
  then one synthesis pass converges on a consensus and names the
  strongest dissent. Four horizons every run: 24 hours, 1 week, 1 month,
  1 year.
- **The Orchestra** — scheduled, runs itself once daily with no human
  trigger, using a server-side xAI key. One search, then five ballots
  (Analyst, Skeptic, Quant, Historian, Contrarian) that cannot see each
  other. The published probability is the median of those ballots. A
  speaker writes the verdict and the resolution criteria and is not
  allowed to change the number. A call is a fixed commitment from the
  moment it's made — never silently revised while active.
- **Resolution** — once a call's horizon passes, a research agent
  investigates the real outcome against resolution criteria written
  before anyone knew the answer, and drafts a verdict with evidence and
  sources. Nothing becomes public until a human reviews and approves it
  on **the Desk** — a private page that reads the draft, lets the
  criteria and evidence be edited if needed, and only then writes to the
  public track record.
- **The Signal** — a lightweight by-product of the same Sensing step:
  one distilled headline and summary per coverage domain, refreshed
  daily, no key required to read.
- **Desk Notes** — dated, written commentary from the human half.
  Not generated. Kept as a permanent archive.

Coverage: Macro Health & Sentiment (US/EU) · Financial & Capital Markets
· Crypto Markets · Geopolitics, Policy & Regulatory · Frontier AI &
Energy.

## Repo structure

```
notcfo/
├── index.html, about.html, notes.html   — public pages
├── desk.html                            — private resolution review (not linked from nav)
├── llms.txt, robots.txt                 — machine-readable summary + data endpoints
├── SECURITY.md                          — vulnerability disclosure process
├── assets/                              — CSS + client-side JS for every section
├── data/                                — live JSON: calls, signal, track record,
│                                           desk notes, resolution drafts, backtest results
├── scripts/
│   ├── swarm.mjs                      — Sensing + Signal + Orchestra (Grok swarm)
│   ├── generate-calls.mjs             — retired 50-persona Claude council, kept for the record
│   ├── resolve-calls.mjs              — resolution research agent (Grok)
│   └── backtest-resolutions.mjs         — verifies the resolution agent against
│                                           20 known historical windows
└── .github/
    ├── workflows/                       — daily generation/resolution run + manual backtest
    └── dependabot.yml                   — keeps Actions versions current
```

## How it runs

Static site on GitHub Pages. Generation and resolution happen via
scheduled GitHub Actions calling the xAI API server-side — no backend,
no database. The secret is `XAI_API_KEY`. The Oracle still runs in the
browser on the visitor's own Anthropic key, held in memory only.

## Security

See [SECURITY.md](./SECURITY.md) for what's in scope and how to report
a vulnerability privately.
