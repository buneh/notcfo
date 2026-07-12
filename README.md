# notcfo

An agentic forecasting and opinion engine — live at [notcfo.com](https://notcfo.com).

notcfo runs two independent forecasting systems in the open, publishes
their reasoning and resolution criteria before outcomes are known, and
keeps a permanent public track record of every call, right or wrong.
Built and maintained by Shota Zhvania (20+ years in debt capital
markets) working alongside Claude (Anthropic) — the human half and the
machine half, both named, neither hidden.

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
  trigger, using a server-side key. Fifty personas (five reasoning
  methodologies × ten evidence lenses) forecast one of five fixed
  standing questions, synthesized into a single consensus call whenever
  a domain's slot is open. A call is a fixed commitment from the moment
  it's made — never silently revised while active.
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
│   ├── generate-calls.mjs               — Sensing + Signal + Orchestra call generation
│   ├── resolve-calls.mjs                — resolution research agent
│   └── backtest-resolutions.mjs         — verifies the resolution agent against
│                                           20 known historical windows
└── .github/
    ├── workflows/                       — daily generation/resolution run + manual backtest
    └── dependabot.yml                   — keeps Actions versions current
```

## How it runs

Static site on GitHub Pages. All generation and resolution happens via
scheduled GitHub Actions calling the Anthropic API server-side — no
backend, no database. The Oracle and the Desk both call external APIs
(Anthropic, GitHub) directly from the browser, with credentials held in
memory only, never persisted.

## Security

See [SECURITY.md](./SECURITY.md) for what's in scope and how to report
a vulnerability privately.
