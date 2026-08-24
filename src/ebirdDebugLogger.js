const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = process.env.EBIRD_DEBUG_LOG_FILE || path.join(LOG_DIR, "ebird-debug.log");

function classifyEbirdUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    const pathname = url.pathname;

    if (pathname === "/v2/ref/taxonomy/ebird") return "taxonomy";
    if (pathname.startsWith("/v2/product/spplist/")) return "country-species-list";
    if (pathname.startsWith("/v2/data/obs/geo/recent/")) return "nearby-species-sightings";
    if (pathname === "/v2/data/obs/geo/recent") return "nearby-all-sightings";
    if (/^\/v2\/data\/obs\/[^/]+\/recent\/[^/]+$/.test(pathname)) {
      return "country-species-recent";
    }
    if (/^\/v2\/data\/obs\/[^/]+\/recent$/.test(pathname)) return "country-recent";
    return pathname;
  } catch {
    return "unknown";
  }
}

function safeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    return `${url.pathname}${url.search}`;
  } catch {
    return String(rawUrl || "").slice(0, 300);
  }
}

function writeLine(entry) {
  if (process.env.EBIRD_DEBUG_LOG === "off") return;

  const line = `${JSON.stringify({
    ts: new Date().toISOString(),
    ...entry
  })}\n`;

  fs.promises
    .mkdir(LOG_DIR, { recursive: true })
    .then(() => fs.promises.appendFile(LOG_FILE, line))
    .catch(() => {});

  if (process.env.EBIRD_DEBUG_CONSOLE === "true") {
    const parts = [
      "[eBird]",
      entry.event || "",
      entry.endpoint || "",
      entry.status ? `status=${entry.status}` : "",
      Number.isFinite(entry.durationMs) ? `${entry.durationMs}ms` : ""
    ].filter(Boolean);
    console.log(parts.join(" "));
  }
}

function logEbirdEvent(entry = {}) {
  writeLine({
    ...entry,
    endpoint: entry.endpoint || classifyEbirdUrl(entry.url),
    url: entry.url ? safeUrl(entry.url) : undefined
  });
}

function logEbirdCache(entry = {}) {
  writeLine({
    event: "cache",
    ...entry
  });
}

module.exports = {
  logEbirdEvent,
  logEbirdCache
};
