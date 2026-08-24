const express = require("express");

const {
  searchTaxonomy,
  getRecentPlacesForSelection
} = require("./ebirdService");
const { getRecentSpeciesLocations } = require("./locationHelperService");

const router = express.Router();

function logRouteError(route, error) {
  if (error?.status === 429 || error?.status === 503) {
    console.warn(`${route} failed: ${error.message}`);
    return;
  }

  console.error(error);
}

router.get("/birds", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ ok: true, birds: [] });

    const birds = await searchTaxonomy({
      query: q,
      apiKey: process.env.EBIRD_API_KEY
    });

    res.json({
      ok: true,
      birds: birds
        .filter((bird) => bird.kind === "species" && bird.speciesCode)
        .slice(0, 25)
    });
  } catch (error) {
    logRouteError("/api/location-helper/birds", error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Bird search failed."
    });
  }
});

router.get("/locations", async (req, res) => {
  try {
    const {
      countryCode = "",
      kind = "species",
      speciesCode = "",
      groupKey = "",
      back = "30"
    } = req.query;

    const cleanKind = kind === "group" ? "group" : "species";

    const locations = cleanKind === "group"
      ? await getRecentPlacesForSelection({
        countryCode,
        kind: "group",
        groupKey,
        back,
        apiKey: process.env.EBIRD_API_KEY
      })
      : await getRecentSpeciesLocations({
        countryCode,
        speciesCode,
        back,
        apiKey: process.env.EBIRD_API_KEY
      });

    res.json({
      ok: true,
      query: {
        countryCode,
        kind: cleanKind,
        speciesCode,
        groupKey,
        daysBack: Number(back)
      },
      count: locations.length,
      locations
    });
  } catch (error) {
    logRouteError("/api/location-helper/locations", error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Find location failed."
    });
  }
});

module.exports = router;
