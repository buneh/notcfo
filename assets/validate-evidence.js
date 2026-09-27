// Shared by the scheduled swarm (Node) and the Oracle (browser).
// A point is kept only when it has a quantity, a unit, a real observation
// date inside the freshness window, and a URL the search tool returned.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NotcfoEvidence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clip(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
  }

  function keyOf(raw) {
    try {
      const u = new URL(String(raw).trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const path = u.pathname.replace(/\/+$/, "") || "/";
      return host + path;
    } catch (e) {
      return "";
    }
  }

  function traced(source, toolSources) {
    const key = keyOf(source);
    if (!key) return false;
    return (toolSources || []).some(function (src) {
      const other = keyOf(src);
      if (!other) return false;
      return key === other || key.indexOf(other + "/") === 0 || other.indexOf(key + "/") === 0;
    });
  }

  function parseDay(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function numericTokens(text) {
    const found = [];
    const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+\.\d+|-?\d+/g;
    const source = String(text || "");
    let match;
    while ((match = re.exec(source))) {
      const raw = match[0];
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      if (n >= 1990 && n <= 2035 && raw.indexOf(".") === -1 && raw.indexOf(",") === -1) continue;
      found.push(n);
    }
    return found;
  }

  function citesBoard(text, items) {
    const claimed = numericTokens(text);
    if (!claimed.length) return false;
    const corpus = (items || []).map(function (item) {
      return item.value + " " + item.point + " " + item.unit;
    }).join(" ");
    const have = numericTokens(corpus);
    return claimed.every(function (n) {
      return have.some(function (h) { return Math.abs(h - n) < 1e-6; });
    });
  }

  function validateBoard(json, toolSources, opts) {
    const options = opts || {};
    const now = options.now ? new Date(options.now) : new Date();
    const maxAgeDays = options.maxAgeDays || 45;
    const row = json && typeof json === "object" ? json : {};
    const items = [];
    const gaps = (Array.isArray(row.gaps) ? row.gaps : []).map(function (gap) {
      return clip(gap, 220);
    }).filter(Boolean);
    let dropped = 0;

    function drop(reason) {
      dropped += 1;
      if (gaps.length < 8) gaps.push(clip(reason, 220));
    }

    (Array.isArray(row.items) ? row.items : []).forEach(function (item) {
      if (items.length >= 8) return;
      const point = clip(item && item.point, 320);
      const value = clip(item && item.value, 32);
      const unit = clip(item && item.unit, 24);
      const source = clip(item && item.source, 300);
      const observed = parseDay(item && item.observedOn);
      if (!point || !/\d/.test(value)) {
        drop("Dropped a point with no quantity.");
        return;
      }
      if (!unit) {
        drop("Dropped " + value + ": no unit.");
        return;
      }
      if (!observed) {
        drop("Dropped " + value + " " + unit + ": no observation date.");
        return;
      }
      const ageDays = (now.getTime() - observed.getTime()) / 86400000;
      if (ageDays < -1) {
        drop("Dropped " + value + " " + unit + ": dated in the future.");
        return;
      }
      if (ageDays > maxAgeDays) {
        drop("Dropped " + value + " " + unit + " observed " + item.observedOn.slice(0, 10) + ": older than " + maxAgeDays + " days.");
        return;
      }
      if (!traced(source, toolSources)) {
        drop("Dropped " + value + " " + unit + ": URL was not in the search results.");
        return;
      }
      const iso = observed.toISOString().slice(0, 10);
      items.push({
        lens: clip(item.lens, 32) || "official",
        point: point,
        value: value,
        unit: unit,
        observedOn: iso,
        source: source,
      });
    });

    return { items: items, gaps: gaps.slice(0, 8), dropped: dropped, sources: toolSources || [] };
  }

  return { validateBoard: validateBoard, citesBoard: citesBoard, numericTokens: numericTokens };
});
