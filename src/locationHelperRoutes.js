const express = require("express");

const { searchTaxonomy } = require("./ebirdService");
const { getRecentSpeciesLocations } = require("./locationHelperService");

const router = express.Router();

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
    console.error(error);
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
      speciesCode = "",
      back = "30"
    } = req.query;

    const locations = await getRecentSpeciesLocations({
      countryCode,
      speciesCode,
      back,
      apiKey: process.env.EBIRD_API_KEY
    });

    res.json({
      ok: true,
      query: {
        countryCode,
        speciesCode,
        daysBack: Number(back)
      },
      count: locations.length,
      locations
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Find location failed."
    });
  }
});

module.exports = router;
