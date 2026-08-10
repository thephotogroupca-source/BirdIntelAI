const EBIRD_BASE = "https://api.ebird.org/v2";

let taxonomyCache = null;
let taxonomyCacheAt = 0;

const TAXONOMY_CACHE_MS = 24 * 60 * 60 * 1000;
const areaSpeciesCache = new Map();
const countrySpeciesCache = new Map();
const countryRecentCache = new Map();

const AREA_SPECIES_CACHE_MS = 5 * 60 * 1000;
const COUNTRY_SPECIES_CACHE_MS = 6 * 60 * 60 * 1000;
const COUNTRY_RECENT_CACHE_MS = 10 * 60 * 1000;

function requireKey(apiKey) {
  if (!apiKey) {
    const error = new Error(
      "EBIRD_API_KEY is not configured. Create .env from .env.example."
    );
    error.status = 500;
    throw error;
  }
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, n))
    : fallback;
}

async function fetchEbird(url, apiKey) {
  requireKey(apiKey);

  const response = await fetch(url, {
    headers: { "X-eBirdApiToken": apiKey }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(
      `eBird API returned ${response.status}. ${body.slice(0, 300)}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function loadTaxonomy(apiKey) {
  requireKey(apiKey);

  if (taxonomyCache && Date.now() - taxonomyCacheAt < TAXONOMY_CACHE_MS) {
    return taxonomyCache;
  }

  const url = new URL(`${EBIRD_BASE}/ref/taxonomy/ebird`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("locale", "en");

  taxonomyCache = await fetchEbird(url, apiKey);
  taxonomyCacheAt = Date.now();

  return taxonomyCache;
}

const GROUP_STOP_WORDS = new Set([
  "all", "bird", "birds", "family", "families", "group", "groups",
  "and", "allies", "the", "of"
]);

function singularizeWord(word) {
  const w = normalize(word).replace(/[^a-z-]/g, "");
  if (!w) return "";
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

function groupWords(text) {
  return normalize(text)
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .map(singularizeWord)
    .filter((word) => word && !GROUP_STOP_WORDS.has(word));
}

function titleCase(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function familyDisplayName(name) {
  return String(name || "")
    .replace(/\s+and\s+Allies$/i, "")
    .trim();
}

function familyGroupKey(familyCode) {
  return `family:${String(familyCode || "").trim()}`;
}

function nameGroupKey(term) {
  return `name:${singularizeWord(term)}`;
}

function parseGroupKey(groupKey) {
  const raw = String(groupKey || "");
  const colon = raw.indexOf(":");
  if (colon < 1) return null;
  return {
    type: raw.slice(0, colon),
    value: raw.slice(colon + 1)
  };
}

function rowMatchesNameGroup(row, term) {
  const wanted = singularizeWord(term);
  if (!wanted) return false;
  return groupWords(row.comName || "").includes(wanted);
}

function getGroupMemberRows(taxonomy, groupKey) {
  const parsed = parseGroupKey(groupKey);
  if (!parsed) return [];

  if (parsed.type === "family") {
    return taxonomy.filter(
      (row) => String(row.familyCode || "") === parsed.value
    );
  }

  if (parsed.type === "name") {
    return taxonomy.filter((row) => rowMatchesNameGroup(row, parsed.value));
  }

  return [];
}

function getGroupDefinitionFromTaxonomy(taxonomy, groupKey) {
  const parsed = parseGroupKey(groupKey);
  if (!parsed) return null;

  const members = getGroupMemberRows(taxonomy, groupKey);
  if (!members.length) return null;

  if (parsed.type === "family") {
    const familyName = members.find((row) => row.familyComName)?.familyComName || "Bird Family";
    const cleanName = familyDisplayName(familyName);
    return {
      groupKey,
      label: `All ${cleanName}`,
      description: `eBird family group: ${familyName}`,
      members
    };
  }

  const labelWord = titleCase(parsed.value.endsWith("s") ? parsed.value : `${parsed.value}s`);
  return {
    groupKey,
    label: `All ${labelWord}`,
    description: `All eBird taxa with “${titleCase(parsed.value)}” in the common name`,
    members
  };
}

function buildGroupSuggestions(taxonomy, query) {
  const qWords = groupWords(query);
  if (!qWords.length) return [];

  const q = normalize(query);
  const suggestions = [];
  const seen = new Set();

  // First use eBird taxonomy families. This automatically covers groups such
  // as hummingbirds, tanagers, storks and flamingos without a hard-coded list.
  const families = new Map();
  for (const row of taxonomy) {
    if (!row.familyCode || !row.familyComName) continue;
    if (!families.has(row.familyCode)) {
      families.set(row.familyCode, row.familyComName);
    }
  }

  for (const [familyCode, familyName] of families.entries()) {
    const familyWords = groupWords(familyName);
    const matches = qWords.some((word) => familyWords.includes(word)) ||
      normalize(familyName).includes(q);
    if (!matches) continue;

    const key = familyGroupKey(familyCode);
    const def = getGroupDefinitionFromTaxonomy(taxonomy, key);
    if (!def || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(def);
  }

  // Also support familiar non-family group words such as eagle, robin,
  // kingfisher, gull, owl, crane, etc. A common-name group is only offered
  // when at least two taxonomy entries match, so a normal species search is
  // not turned into a misleading group.
  for (const word of qWords) {
    const key = nameGroupKey(word);
    const def = getGroupDefinitionFromTaxonomy(taxonomy, key);
    if (!def || def.members.length < 2 || seen.has(key)) continue;

    // If the matching family is a clean one-word family for this term,
    // prefer the family group because it is taxonomically stronger.
    const exactSingleFamilyExists = suggestions.some((existing) => {
      const parsed = parseGroupKey(existing.groupKey);
      if (!parsed || parsed.type !== "family") return false;
      const member = existing.members[0];
      const words = groupWords(member?.familyComName || "");
      return words.length === 1 && words[0] === word;
    });

    if (!exactSingleFamilyExists) {
      seen.add(key);
      // For a broad family such as “Hawks, Eagles, and Kites”, put the
      // familiar “All Eagles” choice before the broader family choice.
      const compoundFamilyIndex = suggestions.findIndex((existing) => {
        const parsed = parseGroupKey(existing.groupKey);
        if (!parsed || parsed.type !== "family") return false;
        const member = existing.members[0];
        const words = groupWords(member?.familyComName || "");
        return words.length > 1 && words.includes(word);
      });
      if (compoundFamilyIndex >= 0) suggestions.splice(compoundFamilyIndex, 0, def);
      else suggestions.push(def);
    }
  }

  return suggestions.slice(0, 8);
}

async function getAreaSpeciesCodes({ lat, lng, dist = 15, back = 30, apiKey }) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const radiusKm = clampNumber(dist, 0, 50, 15);
  const daysBack = clampNumber(back, 1, 30, 30);

  const cacheKey = [
    latitude.toFixed(3),
    longitude.toFixed(3),
    radiusKm,
    daysBack
  ].join("|");

  const cached = areaSpeciesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < AREA_SPECIES_CACHE_MS) {
    return cached.codes;
  }

  const url = new URL(`${EBIRD_BASE}/data/obs/geo/recent`);
  url.searchParams.set("lat", latitude);
  url.searchParams.set("lng", longitude);
  url.searchParams.set("dist", radiusKm);
  url.searchParams.set("back", daysBack);
  url.searchParams.set("sort", "species");

  const rows = await fetchEbird(url, apiKey);
  const codes = new Set(rows.map((row) => row.speciesCode).filter(Boolean));

  areaSpeciesCache.set(cacheKey, {
    at: Date.now(),
    codes
  });

  return codes;
}

async function searchTaxonomy({
  query,
  apiKey,
  lat,
  lng,
  dist = 15,
  back = 30
}) {
  const rows = await loadTaxonomy(apiKey);
  const q = normalize(query);

  if (!q) return [];

  const hasLocation =
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng));

  const areaCodes = hasLocation
    ? await getAreaSpeciesCodes({
        lat,
        lng,
        dist,
        back,
        apiKey
      })
    : null;

  const results = [];
  const groups = buildGroupSuggestions(rows, q);

  for (const group of groups) {
    const local = areaCodes
      ? group.members.filter((row) => areaCodes.has(row.speciesCode))
      : group.members;

    if (areaCodes && local.length === 0) continue;

    results.push({
      kind: "group",
      groupKey: group.groupKey,
      commonName: areaCodes
        ? `${group.label} in this area`
        : group.label,
      scientificName: group.description,
      groupMemberCount: group.members.length,
      nearbySpeciesCount: local.length
    });
  }

  const scored = [];

  for (const row of rows) {
    if (areaCodes && !areaCodes.has(row.speciesCode)) continue;

    const common = row.comName || "";
    const scientific = row.sciName || "";
    const code = row.speciesCode || "";

    const commonN = normalize(common);
    const scientificN = normalize(scientific);
    const codeN = normalize(code);

    let score = 0;

    if (commonN === q) score = 100;
    else if (commonN.startsWith(q)) score = 90;
    else if (commonN.split(/\s+/).some((word) => word.startsWith(q))) score = 80;
    else if (commonN.includes(q)) score = 70;
    else if (scientificN.startsWith(q)) score = 60;
    else if (scientificN.includes(q)) score = 50;
    else if (codeN.startsWith(q)) score = 40;

    if (score > 0) {
      scored.push({
        score,
        kind: "species",
        speciesCode: code,
        commonName: common,
        scientificName: scientific,
        category: row.category || "",
        familyCode: row.familyCode || "",
        familyCommonName: row.familyComName || "",
        reportedNearby: Boolean(areaCodes)
      });
    }
  }

  const exact = scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.commonName.localeCompare(b.commonName)
    )
    .slice(0, 30)
    .map(({ score, ...bird }) => bird);

  return [...results, ...exact];
}

async function getCountrySpeciesCodes({ countryCode, apiKey }) {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) return new Set();

  const cached = countrySpeciesCache.get(code);

  if (cached && Date.now() - cached.at < COUNTRY_SPECIES_CACHE_MS) {
    return cached.codes;
  }

  const url = new URL(
    `${EBIRD_BASE}/product/spplist/${encodeURIComponent(code)}`
  );

  const rows = await fetchEbird(url, apiKey);
  const codes = new Set(rows);

  countrySpeciesCache.set(code, {
    at: Date.now(),
    codes
  });

  return codes;
}

async function countrySupportsSelection({
  countryCode,
  kind,
  speciesCode,
  groupKey,
  apiKey
}) {
  try {
    const countryCodes = await getCountrySpeciesCodes({
      countryCode,
      apiKey
    });

    if (kind === "group") {
      const taxonomy = await loadTaxonomy(apiKey);
      const members = getGroupMemberRows(taxonomy, groupKey);
      if (!members.length) return false;

      return members.some((row) => countryCodes.has(row.speciesCode));
    }

    return countryCodes.has(speciesCode);
  } catch (error) {
    console.error(
      "Country availability check failed:",
      countryCode,
      error.message
    );

    // Keep autocomplete usable if an availability check temporarily fails.
    return true;
  }
}

async function countryHasRecentSelection({
  countryCode,
  kind,
  speciesCode,
  groupKey,
  back = 30,
  apiKey
}) {
  try {
    const rows = await getCountryRecentRows({
      countryCode,
      kind,
      speciesCode,
      groupKey,
      back,
      apiKey
    });

    return rows.length > 0;
  } catch (error) {
    console.error(
      "Recent country availability check failed:",
      countryCode,
      error.message
    );
    return false;
  }
}

async function selectionHasRecentSightingsNear({
  kind,
  speciesCode,
  groupKey,
  lat,
  lng,
  dist = 15,
  back = 30,
  apiKey
}) {
  if (kind === "group") {
    const rows = await getRecentGroupPresenceSightings({
      groupKey, lat, lng, dist, back, apiKey
    });
    return rows.length > 0;
  }

  const rows = await getRecentSpeciesSightings({
    speciesCode, lat, lng, dist, back, apiKey
  });
  return rows.length > 0;
}

async function getCountryRecentRows({
  countryCode,
  kind,
  speciesCode,
  groupKey,
  back = 30,
  apiKey
}) {
  const country = String(countryCode || "").trim().toUpperCase();
  const daysBack = clampNumber(back, 1, 30, 30);

  const cacheKey = [
    country,
    kind,
    speciesCode,
    groupKey,
    daysBack
  ].join("|");

  const cached = countryRecentCache.get(cacheKey);

  if (cached && Date.now() - cached.at < COUNTRY_RECENT_CACHE_MS) {
    return cached.rows;
  }

  let rows = [];

  if (kind === "group") {
    const taxonomy = await loadTaxonomy(apiKey);
    const members = getGroupMemberRows(taxonomy, groupKey);
    if (!members.length) return [];

    const allowedCodes = new Set(
      members.map((row) => row.speciesCode).filter(Boolean)
    );

    const url = new URL(
      `${EBIRD_BASE}/data/obs/${encodeURIComponent(country)}/recent`
    );
    url.searchParams.set("back", daysBack);

    rows = (await fetchEbird(url, apiKey)).filter((row) =>
      allowedCodes.has(row.speciesCode)
    );
  } else {
    const url = new URL(
      `${EBIRD_BASE}/data/obs/${encodeURIComponent(country)}/recent/${encodeURIComponent(speciesCode)}`
    );
    url.searchParams.set("back", daysBack);

    rows = await fetchEbird(url, apiKey);
  }

  countryRecentCache.set(cacheKey, {
    at: Date.now(),
    rows
  });

  return rows;
}

async function getRecentLocationIdsForSelection({
  countryCode,
  kind,
  speciesCode,
  groupKey,
  back = 30,
  apiKey
}) {
  const rows = await getCountryRecentRows({
    countryCode,
    kind,
    speciesCode,
    groupKey,
    back,
    apiKey
  });

  return new Set(rows.map((row) => row.locId).filter(Boolean));
}

function mapObservation(row) {
  return {
    speciesCode: row.speciesCode,
    commonName: row.comName,
    scientificName: row.sciName,
    dateTime: row.obsDt,
    count: row.howMany ?? null,
    locationId: row.locId,
    locationName: row.locName,
    latitude: row.lat,
    longitude: row.lng,
    privateLocation: Boolean(row.locationPrivate),
    submissionId: row.subId
  };
}

async function getRecentAllSightings({
  lat,
  lng,
  dist = 15,
  back = 30,
  apiKey
}) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required.");
    error.status = 400;
    throw error;
  }

  const url = new URL(`${EBIRD_BASE}/data/obs/geo/recent`);
  url.searchParams.set("lat", latitude);
  url.searchParams.set("lng", longitude);
  url.searchParams.set("dist", clampNumber(dist, 0, 50, 15));
  url.searchParams.set("back", clampNumber(back, 1, 30, 30));
  url.searchParams.set("sort", "species");

  return (await fetchEbird(url, apiKey))
    .map(mapObservation)
    .sort(
      (a, b) =>
        a.commonName.localeCompare(b.commonName) ||
        String(b.dateTime).localeCompare(String(a.dateTime))
    );
}

async function getRecentSpeciesSightings({
  speciesCode,
  lat,
  lng,
  dist = 15,
  back = 30,
  apiKey
}) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required.");
    error.status = 400;
    throw error;
  }

  const url = new URL(
    `${EBIRD_BASE}/data/obs/geo/recent/${encodeURIComponent(speciesCode)}`
  );

  url.searchParams.set("lat", latitude);
  url.searchParams.set("lng", longitude);
  url.searchParams.set("dist", clampNumber(dist, 0, 50, 15));
  url.searchParams.set("back", clampNumber(back, 1, 30, 30));

  return (await fetchEbird(url, apiKey))
    .map(mapObservation)
    .sort((a, b) =>
      String(b.dateTime).localeCompare(String(a.dateTime))
    );
}

async function getRecentGroupPresenceSightings({
  groupKey,
  lat,
  lng,
  dist = 15,
  back = 30,
  apiKey
}) {
  const parsedGroup = parseGroupKey(groupKey);
  if (!parsedGroup || !["family", "name"].includes(parsedGroup.type) || !parsedGroup.value) {
    const error = new Error(`Unknown bird group: ${groupKey}`);
    error.status = 400;
    throw error;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required.");
    error.status = 400;
    throw error;
  }

  const taxonomy = await loadTaxonomy(apiKey);
  const members = getGroupMemberRows(taxonomy, groupKey);

  if (!members.length) {
    const error = new Error(`Unknown bird group: ${groupKey}`);
    error.status = 400;
    throw error;
  }

  const allowedCodes = new Set(
    members.map((row) => row.speciesCode).filter(Boolean)
  );

  const url = new URL(`${EBIRD_BASE}/data/obs/geo/recent`);
  url.searchParams.set("lat", latitude);
  url.searchParams.set("lng", longitude);
  url.searchParams.set("dist", clampNumber(dist, 0, 50, 15));
  url.searchParams.set("back", clampNumber(back, 1, 30, 30));
  url.searchParams.set("sort", "species");

  return (await fetchEbird(url, apiKey))
    .filter((row) => allowedCodes.has(row.speciesCode))
    .map(mapObservation);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function getRecentGroupSightings({
  groupKey,
  lat,
  lng,
  dist = 15,
  back = 30,
  apiKey
}) {
  // First use the normal nearby endpoint only to learn WHICH group species
  // occur in the selected area. That endpoint returns only one recent record
  // per species, so it is not sufficient for the final results table.
  const presenceRows = await getRecentGroupPresenceSightings({
    groupKey,
    lat,
    lng,
    dist,
    back,
    apiKey
  });

  const localSpeciesCodes = [
    ...new Set(presenceRows.map((row) => row.speciesCode).filter(Boolean))
  ];

  if (!localSpeciesCodes.length) return [];

  // Then retrieve the species-specific nearby observations for each species.
  // Those calls return the recent sighting locations for that species, so a
  // group such as All Toucans is no longer limited to one record per species.
  // A small concurrency limit avoids creating a large burst of eBird calls.
  const batches = await mapWithConcurrency(
    localSpeciesCodes,
    5,
    (speciesCode) =>
      getRecentSpeciesSightings({
        speciesCode,
        lat,
        lng,
        dist,
        back,
        apiKey
      })
  );

  const combined = batches.flat();
  const seen = new Set();

  return combined
    .filter((row) => {
      // De-duplicate defensively. Submission + species + location + time is
      // stable even if eBird happens to surface the same record twice.
      const key = [
        row.submissionId || "",
        row.speciesCode || "",
        row.locationId || "",
        row.dateTime || ""
      ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        a.commonName.localeCompare(b.commonName) ||
        String(b.dateTime).localeCompare(String(a.dateTime))
    );
}

module.exports = {
  searchTaxonomy,
  getRecentAllSightings,
  getRecentSpeciesSightings,
  getRecentGroupSightings,
  countrySupportsSelection,
  countryHasRecentSelection,
  selectionHasRecentSightingsNear,
  getRecentLocationIdsForSelection
};
