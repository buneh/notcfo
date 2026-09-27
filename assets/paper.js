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

  const HORIZON_DAYS = { "1m": 30, "3m": 91, "6m": 182, "1y": 365 };

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

  const HORIZON_LABEL = { "1m": "1 month", "3m": "3 months", "6m": "6 months", "1y": "1 year" };

  function horizonGrid(call) {
    return `<div class="hz">${(call.horizons || []).map((row) => {
      const rate = Number(row.point);
      const latest = Number(call.latest && call.latest.value);
      let rateText = "";
      if (Number.isFinite(rate)) {
        rateText = rate.toFixed(1) + "%";
        if (Number.isFinite(latest)) {
          const delta = Math.round((rate - latest) * 10) / 10;
          const sign = delta > 0 ? "+" : "";
          rateText += " · " + sign + delta.toFixed(1) + " pp";
        }
      }
      return `<div><b>${esc(row.probability)}%</b><span>${esc(HORIZON_LABEL[row.id] || row.id)}</span><span>${esc(rateText)}</span></div>`;
    }).join("")}</div>`;
  }

  const ROLE_INK = {
    analyst: "#1b1814",
    skeptic: "#8f2d2b",
    quant: "#2f4a44",
    historian: "#6f675c",
    contrarian: "#8a5a2b",
    scholar: "#243656",
  };

  function normalPdf(x, mid, sigma) {
    const z = (x - mid) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  }

  function curvePanel(id, ballots, latest) {
    const rows = (ballots || []).filter((row) => Number.isFinite(row.lo) && Number.isFinite(row.hi) && row.hi > row.lo);
    if (!rows.length) return "";
    const z90 = 1.2815515655446004;
    const sigmas = rows.map((row) => ({ ...row, sigma: (row.hi - row.lo) / (2 * z90) }));
    let minX = Math.min(...sigmas.map((row) => row.lo), Number.isFinite(latest) ? latest : Infinity);
    let maxX = Math.max(...sigmas.map((row) => row.hi), Number.isFinite(latest) ? latest : -Infinity);
    const padX = Math.max(0.15, (maxX - minX) * 0.08);
    minX -= padX;
    maxX += padX;
    const n = 72;
    const xs = Array.from({ length: n }, (_, i) => minX + ((maxX - minX) * i) / (n - 1));
    const series = sigmas.map((row) => xs.map((x) => normalPdf(x, row.mid, row.sigma)));
    const mix = xs.map((_, i) => series.reduce((sum, ys) => sum + ys[i], 0) / series.length);
    const peak = Math.max(...mix, ...series.flat());
    const w = 640;
    const h = 156;
    const box = { l: 38, r: 10, t: 18, b: 28 };
    const X = (x) => box.l + ((x - minX) / (maxX - minX)) * (w - box.l - box.r);
    const Y = (y) => box.t + (1 - y / peak) * (h - box.t - box.b);
    const path = (ys) => ys.map((y, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(y).toFixed(1)}`).join("");
    const lines = sigmas.map((row, i) => `<path d="${path(series[i])}" fill="none" stroke="${ROLE_INK[row.role] || "#1b1814"}" stroke-width="1.4"/>`).join("");
    const ticks = [minX, (minX + maxX) / 2, maxX];
    const labels = ticks.map((x) => `<text x="${X(x).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="#6f675c" font-size="11">${x.toFixed(1)}%</text>`).join("");
    const mark = Number.isFinite(latest)
      ? `<line x1="${X(latest).toFixed(1)}" x2="${X(latest).toFixed(1)}" y1="${box.t}" y2="${h - box.b}" stroke="#8f2d2b" stroke-dasharray="3 3" stroke-width="1"/>`
      : "";
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(HORIZON_LABEL[id] || id)} density">
      <text x="${box.l}" y="13" fill="#1b1814" font-size="12">${esc(HORIZON_LABEL[id] || id)}</text>
      <text x="4" y="${box.t + 4}" fill="#6f675c" font-size="10">density</text>
      <line x1="${box.l}" x2="${w - box.r}" y1="${h - box.b}" y2="${h - box.b}" stroke="#ddd4c6"/>
      ${mark}${lines}<path d="${path(mix)}" fill="none" stroke="#8f2d2b" stroke-width="2.2"/>${labels}
    </svg>`;
  }

  function curveFigure(call) {
    const curves = call.curves || {};
    const ids = ["1m", "3m", "6m", "1y"].filter((id) => (curves[id] || []).length);
    if (!ids.length) return "";
    const latest = Number(call.latest && call.latest.value);
    const sample = curves[ids[0]] || [];
    const legend = sample.map((row) => `<span><i style="background:${ROLE_INK[row.role] || "#1b1814"}"></i>${esc(row.title)}</span>`).join("");
    return `<figure class="curves">${ids.map((id) => curvePanel(id, curves[id], latest)).join("")}<figcaption><p class="legend">${legend}<span><i style="background:#8f2d2b"></i>Desk</span></p><p>Probability density of the year-over-year rate. Each line is one ballot, from that ballot's 10th to 90th percentile. The dashed mark is today's print.</p></figcaption></figure>`;
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
      ${curveFigure(call)}
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
      ${curveFigure(call)}
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
