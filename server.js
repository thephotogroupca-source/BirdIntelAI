require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const {
  searchTaxonomy,
  getRecentAllSightings,
  getRecentSpeciesSightings,
  getRecentGroupSightings,
  countrySupportsSelection,
  countryHasRecentSelection,
  selectionHasRecentSightingsNear,
  getRecentLocationIdsForSelection,
  getRecentPlacesForSelection
} = require("./src/ebirdService");

const {
  searchCountries,
  searchPlaces
} = require("./src/locationService");

const {
  getCommonsImages,
  getCommonsImage
} = require("./src/birdProfilePhotoService");

const { SECTION_CONFIG, getBirdProfileBundle } = require("./src/birdProfileInfoService");
const locationHelperRoutes = require("./src/locationHelperRoutes");

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/location-helper", locationHelperRoutes);


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

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "BirdIntelAI",
    version: "11.8",
    ebirdKeyConfigured: Boolean(process.env.EBIRD_API_KEY)
  });
});

app.get("/api/countries", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    let countries = searchCountries(q);

    const {
      filterByBird = "false",
      birdKind = "",
      speciesCode = "",
      groupKey = "",
      back = "30",
      dist = "15"
    } = req.query;

    if (filterByBird === "true" && (speciesCode || groupKey)) {
      // Country autocomplete checks geographic support, not recent sightings.
      // For groups this endpoint is only called after the user types at least
      // one character, so we check only the small set of matching countries.
      // Low concurrency plus the service cache prevents the old burst of eBird
      // requests that caused 429 Too Many Requests responses.
      const checked = await mapWithConcurrency(
        countries,
        1,
        async (country) => ({
          ...country,
          available: await countrySupportsSelection({
            countryCode: country.code,
            kind: birdKind || "species",
            speciesCode,
            groupKey,
            apiKey: process.env.EBIRD_API_KEY
          })
        })
      );

      countries = checked.filter((country) => country.available);
    }

    res.json({ ok: true, countries });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Country search failed."
    });
  }
});

app.get("/api/locations", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const countryCode = String(req.query.countryCode || "").trim();

    if (!countryCode) {
      return res.json({ ok: true, locations: [] });
    }

    let allowedHotspotIds = null;
    let knownBirdPlaces = null;

    const {
      filterByBird = "false",
      birdKind = "",
      speciesCode = "",
      groupKey = "",
      back = "30",
      dist = "15"
    } = req.query;

    // In Bird-first mode, opening the location field with no typed text shows
    // the recent eBird locations already known for that species/group.
    if (q.length < 2) {
      if (filterByBird === "true" && (speciesCode || groupKey) && q.length === 0) {
        const locations = await getRecentPlacesForSelection({
          countryCode,
          kind: birdKind || "species",
          speciesCode,
          groupKey,
          back,
          apiKey: process.env.EBIRD_API_KEY
        });
        return res.json({ ok: true, locations: locations.slice(0, 80) });
      }
      return res.json({ ok: true, locations: [] });
    }

    if (filterByBird === "true" && (speciesCode || groupKey)) {
      // For a single species, eBird's species-specific country endpoint can
      // safely provide all recent hotspot IDs. For broad groups, the generic
      // country endpoint only exposes one recent record per species, which can
      // hide valid places such as Kota. Do not pre-filter group hotspots here.
      // Every returned candidate is still verified below against the selected
      // radius and period before it is shown to the user.
      if ((birdKind || "species") !== "group") {
        // One species-country request gives us both valid recent place names
        // and their hotspot IDs. Reuse that result for autocomplete instead
        // of making a second full-country hotspot request.
        knownBirdPlaces = await getRecentPlacesForSelection({
          countryCode,
          kind: birdKind || "species",
          speciesCode,
          groupKey,
          back,
          apiKey: process.env.EBIRD_API_KEY
        });

        allowedHotspotIds = new Set(
          knownBirdPlaces.map((row) => row.locationId).filter(Boolean)
        );
      }
    }

    let locations = await searchPlaces({
      query: q,
      countryCode,
      userAgent:
        process.env.APP_USER_AGENT ||
        "BirdIntelAI/1.1 (local-development)",
      apiKey: process.env.EBIRD_API_KEY,
      allowedHotspotIds,
      knownHotspots: knownBirdPlaces
    });

    // In Bird-first mode, every suggested place must itself have at least
    // one matching observation within the selected radius and recent period.
    if (filterByBird === "true" && birdKind !== "group" && speciesCode) {
      // eBird hotspot candidates were already filtered by allowedHotspotIds above,
      // so do not call eBird a second time for those same hotspots. Only general
      // geographic area candidates need the radius/period verification call.
      const checked = await mapWithConcurrency(
        locations,
        1,
        async (location) => {
          const alreadyVerifiedHotspot =
            Boolean(location.locationId) &&
            allowedHotspotIds instanceof Set &&
            allowedHotspotIds.has(location.locationId);

          return {
            location,
            available: alreadyVerifiedHotspot
              ? true
              : await selectionHasRecentSightingsNear({
                  kind: birdKind || "species",
                  speciesCode,
                  groupKey,
                  lat: location.lat,
                  lng: location.lng,
                  dist,
                  back,
                  apiKey: process.env.EBIRD_API_KEY
                })
          };
        }
      );
      locations = checked.filter((row) => row.available).map((row) => row.location);
    }

    res.json({ ok: true, locations });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Location search failed."
    });
  }
});

app.get("/api/birds", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ ok: true, birds: [] });

    const birds = await searchTaxonomy({
      query: q,
      apiKey: process.env.EBIRD_API_KEY,
      lat: req.query.lat,
      lng: req.query.lng,
      dist: req.query.dist || "15",
      back: req.query.back || "30"
    });

    res.json({ ok: true, birds });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Bird search failed."
    });
  }
});

app.get("/api/sightings", async (req, res) => {
  try {
    const {
      kind = "species",
      speciesCode = "",
      groupKey = "",
      commonName = "",
      lat,
      lng,
      locationName = "",
      dist = "15",
      back = "30",
      includePrivate = "no"
    } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        ok: false,
        error: "Country and location are mandatory."
      });
    }

    if (kind !== "all" && !speciesCode && !groupKey) {
      return res.status(400).json({
        ok: false,
        error: "A bird or bird group is required unless All Birds is selected."
      });
    }

    let sightings;

    if (kind === "all") {
      sightings = await getRecentAllSightings({
        lat,
        lng,
        dist,
        back,
        apiKey: process.env.EBIRD_API_KEY
      });
    } else if (kind === "group") {
      sightings = await getRecentGroupSightings({
        groupKey,
        lat,
        lng,
        dist,
        back,
        apiKey: process.env.EBIRD_API_KEY
      });
    } else {
      sightings = await getRecentSpeciesSightings({
        speciesCode,
        lat,
        lng,
        dist,
        back,
        apiKey: process.env.EBIRD_API_KEY
      });
    }

    if (includePrivate !== "yes") {
      sightings = sightings.filter((row) => !row.privateLocation);
    }

    res.json({
      ok: true,
      query: {
        kind,
        speciesCode,
        groupKey,
        commonName,
        locationName,
        lat: Number(lat),
        lng: Number(lng),
        distKm: Number(dist),
        daysBack: Number(back),
        includePrivate: includePrivate === "yes"
      },
      count: sightings.length,
      speciesCount: new Set(
        sightings.map((row) => row.speciesCode).filter(Boolean)
      ).size,
      sightings
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Sightings search failed."
    });
  }
});



const CACHE_DIR = path.join(__dirname, "cache", "species");
const PROFILE_CACHE_MS = Number(process.env.PROFILE_CACHE_DAYS || 365) * 24 * 60 * 60 * 1000;
const IMAGE_CACHE_MS = Number(process.env.IMAGE_CACHE_DAYS || 30) * 24 * 60 * 60 * 1000;
const inFlight = new Map();

function cacheKey({ speciesCode = "", commonName = "", scientificName = "" }) {
  const raw = speciesCode || scientificName || commonName || "bird";
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

async function readCache(file, maxAgeMs) {
  try {
    const text = await fsp.readFile(file, "utf8");
    const data = JSON.parse(text);
    const savedAt = Number(data.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
    return data.value;
  } catch (_) {
    return null;
  }
}

async function writeCache(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, JSON.stringify({ savedAt: Date.now(), value }, null, 2), "utf8");
  await fsp.rename(temp, file);
}

async function cachedWork(key, work) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = Promise.resolve().then(work).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": process.env.APP_USER_AGENT || "BirdIntelAI/3.0",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`External source returned ${response.status}.`);
  return response.json();
}

async function getWkhAskProfile({ commonName, scientificName }) {
  const askUrl = String(
    process.env.WKH_ASK_API_URL || "https://ask.wildlifeknowledgehub.com/api/chat"
  ).trim();

  const birdLabel = scientificName
    ? `${commonName} (${scientificName})`
    : commonName;

  const message = [
    `Create a concise bird profile for ${birdLabel}.`,
    "Write about 120 to 180 words for Wildlife Knowledge Hub.",
    "Cover identification, range and habitat, feeding, and notable behavior when reliable information is available.",
    "Use Wildlife Knowledge Hub reviewed information first when available, otherwise use reliable external wildlife sources.",
    "Do not include URLs or a source list in the answer body."
  ].join(" ");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WKH_ASK_TIMEOUT_MS || 45000));
  let response;
  try {
    response = await fetch(askUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`WKH Ask returned ${response.status}.`);
  const data = await response.json();
  const answer = String(data.answer || "").trim();
  if (!answer) throw new Error("WKH Ask returned an empty bird profile.");
  return {
    answer,
    sourceType: String(data.sourceType || "wkh-ask"),
    preview: Boolean(data.preview)
  };
}

function speciesParams(req) {
  return {
    speciesCode: String(req.query.speciesCode || "").trim(),
    commonName: String(req.query.commonName || "").trim(),
    scientificName: String(req.query.scientificName || "").trim()
  };
}


async function getCachedBirdProfileBundle(params, forceRefresh = false) {
  const key = cacheKey(params);
  const file = path.join(CACHE_DIR, `${key}.profile.bundle.v11_1.json`);

  if (!forceRefresh) {
    const cachedValue = await readCache(file, PROFILE_CACHE_MS);
    if (cachedValue !== null) {
      return { profile: cachedValue, cached: true };
    }
  }

  const profile = await cachedWork(`profile-bundle-v11-1:${key}`, async () => {
    if (!forceRefresh) {
      const secondCheck = await readCache(file, PROFILE_CACHE_MS);
      if (secondCheck !== null) return secondCheck;
    }
    const value = await getBirdProfileBundle(params);
    await writeCache(file, value);
    return value;
  });

  return { profile, cached: false };
}

app.get("/api/species-profile/photo", async (req, res) => {
  try {
    const params = speciesParams(req);
    if (!params.commonName && !params.scientificName) return res.status(400).json({ ok:false, error:"Bird name is required." });
    const key = cacheKey(params);
    const file = path.join(CACHE_DIR, `${key}.images.v4.json`);
    let images = await readCache(file, IMAGE_CACHE_MS);
    let cached = true;
    if (images === null) {
      cached = false;
      images = await cachedWork(`images:${key}`, async () => {
        const value = await getCommonsImages(params.commonName, params.scientificName).catch(() => []);
        await writeCache(file, value);
        return value;
      });
    }
    images = Array.isArray(images) ? images : [];
    const requested = Number.parseInt(String(req.query.index || "0"), 10);
    const index = images.length ? ((Number.isFinite(requested) ? requested : 0) % images.length + images.length) % images.length : 0;
    const image = images[index] || null;
    res.json({ ok:true, image, cached, index, total:images.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:error.message || "Species photo failed." });
  }
});

app.get("/api/species-profile/about", async (req, res) => {
  try {
    const params = speciesParams(req);
    if (!params.commonName && !params.scientificName) {
      return res.status(400).json({ ok:false, error:"Bird name is required." });
    }

    const forceRefresh = String(req.query.refresh || "") === "1";
    const result = await getCachedBirdProfileBundle(params, forceRefresh);

    res.json({
      ok: true,
      profile: result.profile,
      cached: result.cached,
      cacheDays: Number(process.env.PROFILE_CACHE_DAYS || 365)
    });
  } catch (error) {
    console.error(error);
    const msg = error.name === "AbortError"
      ? "Bird information is taking longer than expected."
      : (error.message || "Bird information failed.");
    res.status(500).json({ ok:false, error:msg });
  }
});

// Compatibility endpoint. Section buttons in older pages still reuse the same
// single cached Bird Profile instead of creating a new OpenAI call per topic.
app.get("/api/species-profile/about-section", async (req, res) => {
  try {
    const params = speciesParams(req);
    const section = String(req.query.section || "").trim();
    if (!params.commonName && !params.scientificName) {
      return res.status(400).json({ ok:false, error:"Bird name is required." });
    }
    if (!SECTION_CONFIG[section]) {
      return res.status(400).json({ ok:false, error:"Unknown Bird Profile section." });
    }

    const result = await getCachedBirdProfileBundle(params, false);
    res.json({
      ok: true,
      section,
      text: result.profile?.[section] || "",
      cached: result.cached
    });
  } catch (error) {
    console.error(error);
    const msg = error.name === "AbortError"
      ? "This section is taking longer than expected."
      : (error.message || "Bird information failed.");
    res.status(500).json({ ok:false, error:msg });
  }
});

// Compatibility endpoint. Conservation comes from the same single cached
// Bird Profile and therefore does not trigger a separate OpenAI request.
app.get("/api/species-profile/conservation", async (req, res) => {
  try {
    const params = speciesParams(req);
    if (!params.commonName && !params.scientificName) {
      return res.status(400).json({ ok:false, error:"Bird name is required." });
    }

    const result = await getCachedBirdProfileBundle(params, false);
    res.json({
      ok: true,
      conservation: result.profile?.conservation || {},
      cached: result.cached
    });
  } catch (error) {
    console.error(error);
    const msg = error.name === "AbortError"
      ? "Conservation information is taking longer than expected."
      : (error.message || "Conservation information failed.");
    res.status(500).json({ ok:false, error:msg });
  }
});

// Compatibility endpoint retained for any older profile page or bookmark.
app.get("/api/species-profile", async (req, res) => {
  try {
    const params = speciesParams(req);
    if (!params.commonName && !params.scientificName) return res.status(400).json({ ok:false, error:"Bird name is required." });
    const key = cacheKey(params);
    const profileFile = path.join(CACHE_DIR, `${key}.profile.json`);
    const imageFile = path.join(CACHE_DIR, `${key}.image.json`);
    let profile = await readCache(profileFile, PROFILE_CACHE_MS);
    let image = await readCache(imageFile, IMAGE_CACHE_MS);
    const [profileResult, imageResult] = await Promise.all([
      profile !== null ? profile : cachedWork(`profile:${key}`, async () => {
        const value = await getWkhAskProfile(params);
        await writeCache(profileFile, value);
        return value;
      }).catch((error) => ({ answer:"The Wildlife Knowledge Hub Ask service could not prepare this bird profile just now. Please try again.", sourceType:"unavailable", preview:false, error:error.message })),
      image !== null ? image : cachedWork(`image:${key}`, async () => {
        const value = await getCommonsImage(params.commonName, params.scientificName).catch(() => null);
        await writeCache(imageFile, value);
        return value;
      })
    ]);
    const sources = [{ name:"Wildlife Knowledge Hub Ask", url:"https://ask.wildlifeknowledgehub.com/" }];
    if (params.speciesCode) sources.push({ name:"Cornell Lab eBird", url:`https://ebird.org/species/${encodeURIComponent(params.speciesCode)}` });
    if (imageResult?.descriptionUrl) sources.push({ name:"Wikimedia Commons", url:imageResult.descriptionUrl });
    res.json({ ok:true, ...params, summary:profileResult.answer, image:imageResult, sources, profileSource:profileResult.sourceType, askPreview:profileResult.preview, askError:profileResult.error || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:error.message || "Species profile failed." });
  }
});

async function callWkhAsk(message) {
  const askUrl = String(
    process.env.WKH_ASK_API_URL || "https://ask.wildlifeknowledgehub.com/api/chat"
  ).trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WKH_ASK_TIMEOUT_MS || 45000));
  try {
    const response = await fetch(askUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`WKH Ask returned ${response.status}.`);
    const data = await response.json();
    const answer = String(data.answer || "").trim();
    if (!answer) throw new Error("WKH Ask returned an empty answer.");
    return { answer, sourceType: String(data.sourceType || "wkh-ask") };
  } finally {
    clearTimeout(timeout);
  }
}

function cleanBirdChatAnswer(answer) {
  return String(answer || "")
    .replace(/\[WKH_VIDEO_URL\]/gi, "")
    .replace(/Note:\s*The information above has been reviewed and verified by WKH \(Wildlife Knowledge Hub\)\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

app.post("/api/ask-bird", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const bird = req.body?.bird || {};
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    if (!question) return res.status(400).json({ ok:false, error:"Please enter a question." });
    const prompt = [
      "WILDLIFE CONTEXT: This request comes from the Ask WKH about this bird feature in Bird Intel AI. Treat the full conversation as a wildlife-related request unless the user clearly changes to an unrelated subject.",
      "You are WKH Ask inside a Bird Intel AI species profile.",
      `The selected bird and continuing subject is ${bird.commonName || "this bird"}${bird.scientificName ? ` (${bird.scientificName})` : ""}${bird.speciesCode ? `, eBird species code ${bird.speciesCode}` : ""}.`,
      "Resolve follow-up words such as it, this bird, the bird, there, that area, that location, and dates from the selected bird and recent chat context.",
      "Questions remain in scope when they reasonably help the user understand, find, observe, photograph, or support this bird. This includes locations, travel timing, likelihood of seeing it, seasonality, habitat, elevation, weather, flowering plants, nectar sources, feeders, food, breeding, migration, identification, photography conditions, conservation, predators, and related ecology.",
      "A question about a place, month, plant, flower, habitat, or environmental condition is wildlife-related when the conversation connects it to the selected bird. Do not reject it merely because the latest sentence does not repeat the bird's name.",
      "Only treat a question as outside scope when the user clearly changes to a subject unrelated to wildlife or the selected bird context.",
      "Use Wildlife Knowledge Hub reviewed information first when available, then reliable wildlife sources. Do not invent facts. If a probability cannot be supported, explain the likely chance qualitatively and what evidence would improve the estimate.",
      "Be concise and useful for birders and wildlife photographers.",
      history.length ? `RECENT CHAT: ${JSON.stringify(history)}` : "",
      `USER QUESTION ABOUT THE SELECTED BIRD OR ITS CONTEXT: ${question}`
    ].filter(Boolean).join("\n\n");
    const result = await callWkhAsk(prompt);
    res.json({ ok:true, answer:cleanBirdChatAnswer(result.answer) });
  } catch (error) {
    console.error(error);
    const msg = error.name === "AbortError" ? "WKH Ask is taking longer than expected. Please try again." : (error.message || "WKH Ask failed.");
    res.status(500).json({ ok:false, error:msg });
  }
});

app.listen(PORT, () => {
  console.log(`BirdIntelAI_V11.8 running at http://localhost:${PORT}`);
});
