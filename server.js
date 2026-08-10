require("dotenv").config();

const express = require("express");
const path = require("path");

const {
  searchTaxonomy,
  getRecentAllSightings,
  getRecentSpeciesSightings,
  getRecentGroupSightings,
  countrySupportsSelection,
  countryHasRecentSelection,
  selectionHasRecentSightingsNear,
  getRecentLocationIdsForSelection
} = require("./src/ebirdService");

const {
  searchCountries,
  searchPlaces
} = require("./src/locationService");

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "BirdIntelAI",
    version: "1.1.0",
    ebirdKeyConfigured: Boolean(process.env.EBIRD_API_KEY)
  });
});

app.get("/api/countries", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) return res.json({ ok: true, countries: [] });

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
      const checked = await Promise.all(
        countries.slice(0, 14).map(async (country) => ({
          ...country,
          available: await countryHasRecentSelection({
            countryCode: country.code,
            kind: birdKind || "species",
            speciesCode,
            groupKey,
            back,
            apiKey: process.env.EBIRD_API_KEY
          })
        }))
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

    if (q.length < 2 || !countryCode) {
      return res.json({ ok: true, locations: [] });
    }

    let allowedHotspotIds = null;

    const {
      filterByBird = "false",
      birdKind = "",
      speciesCode = "",
      groupKey = "",
      back = "30",
      dist = "15"
    } = req.query;

    if (filterByBird === "true" && (speciesCode || groupKey)) {
      // For a single species, eBird's species-specific country endpoint can
      // safely provide all recent hotspot IDs. For broad groups, the generic
      // country endpoint only exposes one recent record per species, which can
      // hide valid places such as Kota. Do not pre-filter group hotspots here.
      // Every returned candidate is still verified below against the selected
      // radius and period before it is shown to the user.
      if ((birdKind || "species") !== "group") {
        allowedHotspotIds = await getRecentLocationIdsForSelection({
          countryCode,
          kind: birdKind || "species",
          speciesCode,
          groupKey,
          back,
          apiKey: process.env.EBIRD_API_KEY
        });
      }
    }

    let locations = await searchPlaces({
      query: q,
      countryCode,
      userAgent:
        process.env.APP_USER_AGENT ||
        "BirdIntelAI/1.1 (local-development)",
      apiKey: process.env.EBIRD_API_KEY,
      allowedHotspotIds
    });

    // In Bird-first mode, every suggested place must itself have at least
    // one matching observation within the selected radius and recent period.
    if (filterByBird === "true" && (speciesCode || groupKey)) {
      const checked = await Promise.all(
        locations.map(async (location) => ({
          location,
          available: await selectionHasRecentSightingsNear({
            kind: birdKind || "species",
            speciesCode,
            groupKey,
            lat: location.lat,
            lng: location.lng,
            dist,
            back,
            apiKey: process.env.EBIRD_API_KEY
          })
        }))
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
      back = "30"
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
        daysBack: Number(back)
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

app.listen(PORT, () => {
  console.log(`BirdIntelAI v1.1 running at http://localhost:${PORT}`);
});
