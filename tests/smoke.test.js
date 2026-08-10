const test = require("node:test");
const assert = require("node:assert/strict");

const {
  searchTaxonomy,
  getRecentAllSightings,
  getRecentGroupSightings
} = require("../src/ebirdService");

test("taxonomy service rejects missing API key", async () => {
  await assert.rejects(
    () =>
      searchTaxonomy({
        query: "eagle",
        apiKey: ""
      }),
    /EBIRD_API_KEY is not configured/
  );
});

test("All Birds service rejects missing API key", async () => {
  await assert.rejects(
    () =>
      getRecentAllSightings({
        lat: 43.13,
        lng: -80.75,
        apiKey: ""
      }),
    /EBIRD_API_KEY is not configured/
  );
});

test("unknown bird group is rejected", async () => {
  await assert.rejects(
    () =>
      getRecentGroupSightings({
        groupKey: "not-a-group",
        lat: 43.13,
        lng: -80.75,
        apiKey: "test-key"
      }),
    /Unknown bird group/
  );
});
