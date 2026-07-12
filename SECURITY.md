# Security Policy

notcfo is a small, personal forecasting practice — but it handles two
genuinely sensitive things, and both are worth a real disclosure process
rather than none:

- **The Oracle** holds each visitor's own Anthropic API key in browser
  memory for the duration of their session.
- **The Desk** holds a GitHub personal access token with write access to
  this repository, in browser memory, for whoever is reviewing
  resolutions.

If you find a way to extract, leak, or misuse either of those — or any
other vulnerability affecting this site or its automation — please
report it privately rather than opening a public issue.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature on this repository
(**Security** tab → **Report a vulnerability**). This creates a draft
security advisory visible only to the repository owner — nothing is
public until we agree it should be.

If that's not available for any reason, opening an issue that says
"I found a security issue, how should I send details privately" (with
no details in the issue itself) works too.

## What's in scope

- Cross-site scripting or injection anywhere content flows into the page
  (Signal, the Orchestra, Desk Notes, the Oracle, the Desk)
- Anything that could expose or exfiltrate an API key or access token
  held in browser memory
- Anything that lets someone write to this repository without going
  through the Desk's own review flow
- Vulnerabilities in the GitHub Actions automation (`scripts/`,
  `.github/workflows/`)

## What's not in scope

- Disagreements with a forecast's accuracy or a resolution's outcome —
  that's a judgment call, not a security issue
- Rate limits or costs incurred against your own API key by using the
  Oracle as intended

## Response

This is a personal project, not a funded security program, so there's
no formal SLA — but reports are taken seriously and we'll respond as
quickly as we reasonably can. Credit is welcome if you'd like it once a
fix ships; anonymity is also fine.
