const EBIRD_BASE = "https://api.ebird.org/v2";
const { logEbirdEvent, logEbirdCache } = require("./ebirdDebugLogger");

const LOCATION_CACHE_MS = Number(process.env.LOCATION_HELPER_CACHE_MINUTES || 10) * 60 * 1000;
const locationCache = new Map();
const inFlight = new Map();

function requireKey(apiKey) {
  if (!apiKey) {
    const error = new Error(
      "EBIRD_API_KEY is not configured. Create .env from .env.example."
    );
    error.status = 500;
    throw error;
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, n))
    : fallback;
}

function cleanCountryCode(countryCode) {
  return String(countryCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

async function fetchEbird(url, apiKey) {
  requireKey(apiKey);

  const startedAt = Date.now();
  logEbirdEvent({
    event: "request",
    source: "locationHelperService",
    url
  });

  const response = await fetch(url, {
    headers: { "X-eBirdApiToken": apiKey }
  });

  if (response.ok) {
    const payload = await response.json();
    logEbirdEvent({
      event: "success",
      source: "locationHelperService",
      status: response.status,
      durationMs: Date.now() - startedAt,
      rows: Array.isArray(payload) ? payload.length : undefined,
      url
    });
    return payload;
  }

  const body = await response.text();
  logEbirdEvent({
    event: "error",
    source: "locationHelperService",
    status: response.status,
    durationMs: Date.now() - startedAt,
    body: body.slice(0, 120),
    url
  });

  const error = new Error(
    `eBird API returned ${response.status}. ${body.slice(0, 300)}`
  );
  error.status = response.status;
  throw error;
}

function locationKey(row) {
  if (row.locId) return `loc:${row.locId}`;
  return [
    "geo",
    row.locName || "",
    Number(row.lat).toFixed(4),
    Number(row.lng).toFixed(4)
  ].join("|");
}

function mapLocation(row) {
  return {
    locationId: row.locId || "",
    name: row.locName || "eBird location",
    regionCode: row.subnational1Code || row.subnational1 || "",
    regionName: row.subnational1Name || row.regionName || "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    latestDateTime: row.obsDt || "",
    privateLocation: Boolean(row.locationPrivate)
  };
}

function uniqueLocations(rows) {
  const locationsByKey = new Map();

  for (const row of rows || []) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const key = locationKey(row);
    const mapped = mapLocation(row);
    const existing = locationsByKey.get(key);

    if (!existing || String(mapped.latestDateTime) > String(existing.latestDateTime || "")) {
      locationsByKey.set(key, mapped);
    }
  }

  return [...locationsByKey.values()].sort(
    (a, b) =>
      String(b.latestDateTime || "").localeCompare(String(a.latestDateTime || "")) ||
      a.name.localeCompare(b.name)
  );
}

async function cachedWork(key, work) {
  const cached = locationCache.get(key);
  if (cached && Date.now() - cached.savedAt < LOCATION_CACHE_MS) {
    logEbirdCache({
      source: "locationHelperService",
      endpoint: "country-species-recent",
      result: "hit"
    });
    return cached.value;
  }

  if (inFlight.has(key)) {
    logEbirdCache({
      source: "locationHelperService",
      endpoint: "country-species-recent",
      result: "in-flight"
    });
    return inFlight.get(key);
  }

  const promise = Promise.resolve()
    .then(work)
    .then((value) => {
      locationCache.set(key, {
        savedAt: Date.now(),
        value
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

async function getRecentSpeciesLocations({
  countryCode,
  speciesCode,
  back = 30,
  maxResults = 1000,
  apiKey
}) {
  const country = cleanCountryCode(countryCode);
  const code = String(speciesCode || "").trim();
  const daysBack = clampNumber(back, 1, 30, 30);
  const resultLimit = clampNumber(maxResults, 1, 10000, 1000);

  if (!country) {
    const error = new Error("Country is required.");
    error.status = 400;
    throw error;
  }

  if (!code) {
    const error = new Error("Bird species is required.");
    error.status = 400;
    throw error;
  }

  const cacheKey = [country, code, daysBack, resultLimit].join("|");

  return cachedWork(cacheKey, async () => {
    const url = new URL(
      `${EBIRD_BASE}/data/obs/${encodeURIComponent(country)}/recent/${encodeURIComponent(code)}`
    );
    url.searchParams.set("back", daysBack);
    url.searchParams.set("maxResults", resultLimit);

    const rows = await fetchEbird(url, apiKey);
    return uniqueLocations(rows);
  });
}

module.exports = {
  getRecentSpeciesLocations,
  uniqueLocations
};
