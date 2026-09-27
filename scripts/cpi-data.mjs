// Official inflation feeds. No model, no key.
// US CPI indexes: BLS public API. Eurozone HICP rates: ECB HICP dataflow (Eurostat).

const BLS = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
const BLS_PAGE = "https://data.bls.gov/timeseries/CUUR0000SA0";
const ECB = "https://data-api.ecb.europa.eu/service/data/HICP/";
const ECB_PAGE = "https://data.ecb.europa.eu/data/concepts/hicp";

const BLS_SERIES = [
  ["CUUR0000SA0", "US CPI headline", "official"],
  ["CUUR0000SAF1", "US CPI food", "component"],
  ["CUUR0000SAH1", "US CPI shelter", "component"],
  ["CUUR0000SAE1", "US CPI energy", "component"],
];

const ECB_SERIES = [
  ["M.U2.N.000000.4D0.ANR", "Eurozone HICP headline", "official"],
  ["M.U2.N.NRGY00.4D0.ANR", "Eurozone HICP energy", "component"],
  ["M.U2.N.FOOD00.4D0.ANR", "Eurozone HICP food", "component"],
  ["M.U2.N.SERV00.4D0.ANR", "Eurozone HICP services", "component"],
  ["M.U2.N.XEF000.4D0.ANR", "Eurozone HICP core", "component"],
];

function monthEnd(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function one(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": "notcfo" } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.text();
}

async function loadBls() {
  const year = new Date().getUTCFullYear();
  const response = await fetch(BLS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "notcfo" },
    body: JSON.stringify({
      seriesid: BLS_SERIES.map((row) => row[0]),
      startyear: String(year - 2),
      endyear: String(year),
    }),
  });
  if (!response.ok) throw new Error(`BLS ${response.status}`);
  const payload = await response.json();
  if (payload.status !== "REQUEST_SUCCEEDED") throw new Error("BLS request failed");
  const byId = new Map(payload.Results.series.map((series) => [series.seriesID, series.data]));
  const items = [];
  const series = [];
  let latest = null;
  for (const [id, name, category] of BLS_SERIES) {
    const rows = (byId.get(id) || [])
      .map((row) => ({ year: Number(row.year), month: Number(row.period.slice(1)), value: Number(row.value) }))
      .filter((row) => row.month >= 1 && row.month <= 12 && Number.isFinite(row.value))
      .sort((a, b) => a.year - b.year || a.month - b.month);
    const points = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const base = rows.find((other) => other.year === row.year - 1 && other.month === row.month);
      if (!base) continue;
      points.push({
        observedOn: monthEnd(row.year, row.month),
        value: one((row.value / base.value - 1) * 100),
        unit: "% YoY",
        source: BLS_PAGE,
      });
    }
    if (!points.length) continue;
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    series.push({ name, unit: "% YoY", points: points.slice(-18) });
    const moved = prev ? ` Prior month ${prev.value}.` : "";
    items.push({
      lens: "official",
      category,
      relevance: category === "official" ? "direct" : "context",
      event: name,
      value: last.value,
      unit: "% YoY",
      observedOn: last.observedOn,
      source: BLS_PAGE,
      point: `${name} was ${last.value}% year-over-year in the reference month ending ${last.observedOn}.${moved}`,
    });
    if (id === "CUUR0000SA0") {
      const lastIndex = rows[rows.length - 1];
      const prevIndex = rows[rows.length - 2];
      latest = { value: Number(last.value), observedOn: last.observedOn, unit: "% YoY" };
      if (prevIndex) {
        const mom = one((lastIndex.value / prevIndex.value - 1) * 100);
        items.push({
          lens: "official",
          category: "official",
          relevance: "direct",
          event: "US CPI month-over-month",
          value: mom,
          unit: "% MoM",
          observedOn: last.observedOn,
          source: BLS_PAGE,
          point: `US CPI index rose ${mom}% from the prior month.`,
        });
      }
    }
  }
  if (!latest) throw new Error("BLS headline missing");
  return {
    items,
    gaps: ["No oil price on this feed. The energy row is the CPI energy index.", "US CPI is monthly. The next print is the following month, not this week."],
    sources: [BLS, BLS_PAGE],
    series,
    latest,
    schedule: `Latest US CPI month ends ${latest.observedOn}. CPI does not print weekly. The one-week point stays on ${latest.value} unless a BLS release falls inside seven days.`,
  };
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const head = lines[0].split(",");
  const time = head.indexOf("TIME_PERIOD");
  const value = head.indexOf("OBS_VALUE");
  if (time < 0 || value < 0) throw new Error("ECB csv missing columns");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return { period: cells[time], value: Number(cells[value]) };
  }).filter((row) => /^\d{4}-\d{2}$/.test(row.period) && Number.isFinite(row.value));
}

async function loadEcb() {
  const items = [];
  const series = [];
  let latest = null;
  for (const [key, name, category] of ECB_SERIES) {
    const text = await get(`${ECB}${key}?lastNObservations=18&format=csvdata`);
    const rows = parseCsv(text);
    if (!rows.length) continue;
    const points = rows.map((row) => ({
      observedOn: monthEnd(Number(row.period.slice(0, 4)), Number(row.period.slice(5))),
      value: one(row.value),
      unit: "% YoY",
      source: ECB_PAGE,
    }));
    series.push({ name, unit: "% YoY", points });
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    items.push({
      lens: "official",
      category,
      relevance: category === "official" ? "direct" : "context",
      event: name,
      value: last.value,
      unit: "% YoY",
      observedOn: last.observedOn,
      source: ECB_PAGE,
      point: `${name} was ${last.value}% year-over-year in the reference month ending ${last.observedOn}.${prev ? ` Prior month ${prev.value}.` : ""}`,
    });
    if (category === "official") latest = { value: Number(last.value), observedOn: last.observedOn, unit: "% YoY" };
  }
  if (!latest) throw new Error("ECB headline missing");
  return {
    items,
    gaps: ["Energy here is the HICP energy index, not a Brent quote."],
    sources: [`${ECB}M.U2.N.000000.4D0.ANR`, ECB_PAGE],
    series,
    latest,
    schedule: `Latest Eurozone HICP month ends ${latest.observedOn}. A flash for the next month is often the last working day of that month. If no flash falls inside seven days, the one-week point stays on ${latest.value}.`,
  };
}

export async function loadOfficialBoard(id) {
  if (id === "us-cpi") return loadBls();
  if (id === "ez-cpi") return loadEcb();
  throw new Error(`no official feed for ${id}`);
}
