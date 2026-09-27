(function () {
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }

  const HORIZON_DAYS = { "24h": 1, "1w": 7, "1m": 30, "1y": 365 };

  function callDue(calledAt, horizon) {
    const days = HORIZON_DAYS[horizon] ?? 30;
    const start = new Date(calledAt).getTime();
    if (Number.isNaN(start)) return false;
    return Date.now() > start + days * 86400000;
  }

  async function load(path) {
    const res = await fetch(path + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(path);
    return res.json();
  }

  function signalItem(topic) {
    const rows = (topic.evidence || []).map((item) => {
      const href = item.source && String(item.source).indexOf("http") === 0
        ? `<a href="${esc(item.source)}" target="_blank" rel="noreferrer">${esc(String(item.source).replace(/^https?:\/\//, ""))}</a>`
        : "";
      const tag = [item.category, item.relevance].filter(Boolean).join(" · ");
      return `<div class="print"><p class="meta">${tag ? esc(tag) + " · " : ""}${esc(item.value)} ${esc(item.unit)} · ${esc(item.observedOn)}</p><p>${esc(item.point)}</p>${href ? `<p class="src">${href}</p>` : ""}</div>`;
    }).join("");
    const gaps = (topic.gaps || []).slice(0, 3).map((gap) => `<p class="muted">${esc(gap)}</p>`).join("");
    return `<li>
      <p class="domain">${esc(topic.domain)}</p>
      <h3>${esc(topic.headline)}</h3>
      <p class="muted">${esc(topic.summary)}</p>
      ${rows}
      ${gaps}
    </li>`;
  }

  const HORIZON_LABEL = { "1w": "1 week", "1m": "1 month", "1q": "1 quarter", "1y": "1 year" };

  function horizonGrid(call) {
    return `<div class="hz">${(call.horizons || []).map((row) =>
      `<div><b>${esc(row.probability)}</b><span>${esc(HORIZON_LABEL[row.id] || row.id)}</span><span>${esc(row.point)}%</span></div>`
    ).join("")}</div>`;
  }

  function callRow(call) {
    const due = callDue(call.calledAt, call.horizon);
    return `<li class="call">
      ${(call.horizons || []).length ? horizonGrid(call) : `<p class="prob">${esc(call.probability)}</p>`}
      <div>
        <p class="domain">${esc(call.domain)}</p>
        <p class="q">${esc(call.question)}</p>
        <p class="meta">${due ? "Closed" : "Open"}${call.latest ? ` · latest ${esc(call.latest.value)}% · ${esc(call.latest.observedOn)}` : ` · ${esc(fmtDate(call.calledAt))}`}</p>
      </div>
    </li>`;
  }

  function callSheet(call) {
    const due = callDue(call.calledAt, call.horizon);
    return `<article class="sheet">
      <div>
        <p class="domain">${esc(call.domain)}</p>
        <h2>${esc(call.question)}</h2>
        <p>${esc(call.forecast)}</p>
        <p class="muted">${esc(call.resolutionCriteria)}</p>
        <p class="meta">${due ? "Closed" : "Open"} · ${esc(fmtDate(call.calledAt))} · ${esc(call.horizon)}</p>
      </div>
      <div class="score">
        ${(call.horizons || []).length ? horizonGrid(call) : `<p class="prob">${esc(call.probability)}</p>`}
      </div>
    </article>`;
  }

  async function boot() {
    const page = document.body.dataset.page;
    try {
      if (page === "desk" || page === "orchestra") {
        const [signal, book] = await Promise.all([load("/data/signal.json"), load("/data/calls.json")]);
        const topics = signal.topics || [];
        const calls = book.calls || [];
        const signalEl = document.getElementById("signal");
        const callsEl = document.getElementById("calls");
        if (signalEl) {
          signalEl.innerHTML = topics.length
            ? topics.map(signalItem).join("")
            : `<li><p class="muted">No signal on the tape.</p></li>`;
        }
        if (callsEl) {
          callsEl.innerHTML = calls.length
            ? calls.map(page === "orchestra" ? callSheet : callRow).join("")
            : `<li><p class="muted">No standing calls.</p></li>`;
        }
        const stamp = document.getElementById("signal-asof");
        if (stamp && signal.generatedAt) stamp.textContent = "Signal as of " + fmtDate(signal.generatedAt);
      }
      if (page === "notes") {
        const data = await load("/data/desk-notes.json");
        const notes = (data.notes || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
        const el = document.getElementById("notes");
        el.innerHTML = notes
          .map((note) => {
            const body = (note.body || []).map((p) => `<p>${esc(p)}</p>`).join("");
            return `<article class="note" id="note-${esc(note.id)}">
              <p class="meta">${esc(note.tag)} · ${esc(fmtDate(note.date))}</p>
              <h2>${esc(note.title)}</h2>
              ${body}
            </article>`;
          })
          .join("");
      }
    } catch (err) {
      const el = document.getElementById("signal") || document.getElementById("notes") || document.getElementById("calls");
      if (el) el.innerHTML = `<li><p class="muted">The public tape did not load.</p></li>`;
    }
  }

  boot();
})();
