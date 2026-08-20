const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getRecentSpeciesLocations,
  uniqueLocations
} = require("../src/locationHelperService");

test("location helper rejects missing API key", async () => {
  await assert.rejects(
    () =>
      getRecentSpeciesLocations({
        countryCode: "US",
        speciesCode: "luc hum",
        apiKey: ""
      }),
    /EBIRD_API_KEY is not configured/
  );
});

test("location helper keeps unique locations and newest sort order", () => {
  const locations = uniqueLocations([
    {
      locId: "L1",
      locName: "First Hotspot",
      lat: 31.1,
      lng: -110.2,
      obsDt: "2026-08-18 08:00",
      locationPrivate: false
    },
    {
      locId: "L1",
      locName: "First Hotspot",
      lat: 31.1,
      lng: -110.2,
      obsDt: "2026-08-20 07:30",
      locationPrivate: false
    },
    {
      locId: "L2",
      locName: "Second Hotspot",
      lat: 32.1,
      lng: -111.2,
      obsDt: "2026-08-19 10:15",
      locationPrivate: false
    }
  ]);

  assert.equal(locations.length, 2);
  assert.equal(locations[0].name, "First Hotspot");
  assert.equal(locations[0].latestDateTime, "2026-08-20 07:30");
  assert.equal(locations[1].name, "Second Hotspot");
});
