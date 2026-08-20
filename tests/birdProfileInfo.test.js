const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBirdProfileRequest,
  parseBirdProfileText
} = require("../src/birdProfileInfoService");

test("Costa Rica batch request includes the regional profile context", () => {
  const body = buildBirdProfileRequest(
    {
      commonName: "Snowcap",
      scientificName: "Microchera albocoronata",
      contextCountry: "Costa Rica"
    },
    { model: "gpt-5.6-luna" }
  );

  assert.equal(body.model, "gpt-5.6-luna");
  assert.match(body.input, /Regional context: Costa Rica/);
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
});

test("profile parser preserves every Bird Profile category", () => {
  const profile = parseBirdProfileText(JSON.stringify({
    sections: {
      overview: "Overview",
      classification: "Classification",
      identification: "Identification",
      rangeHabitat: "Range and habitat",
      migrationStatus: "Resident",
      breeding: "Breeding",
      dietFeeding: "Diet and feeding",
      behavior: "Behavior"
    },
    conservation: {
      status: "LC",
      populationTrend: "Stable"
    }
  }));

  assert.equal(profile.overview, "Overview");
  assert.equal(profile.classification, "Classification");
  assert.equal(profile.identification, "Identification");
  assert.equal(profile.rangeHabitat, "Range and habitat");
  assert.equal(profile.migrationStatus, "Resident");
  assert.equal(profile.breeding, "Breeding");
  assert.equal(profile.dietFeeding, "Diet and feeding");
  assert.equal(profile.behavior, "Behavior");
  assert.equal(profile.conservation.status, "Least Concern");
  assert.equal(profile.conservation.populationTrend, "Stable");
});

