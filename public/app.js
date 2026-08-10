const $ = (id) => document.getElementById(id);

const form = $("searchForm");

const modeLocation = $("modeLocation");
const modeBird = $("modeBird");
const modeHelp = $("modeHelp");
const clearSearchButton = $("clearSearch");

const locationSection = $("locationSection");
const birdSection = $("birdSection");
const locationBirdChoice = $("locationBirdChoice");
const birdRequiredMark = $("birdRequiredMark");
const mandatoryText = $("mandatoryText");

const countryInput = $("countryInput");
const locationInput = $("locationInput");
const birdInput = $("birdInput");

const countrySuggestions = $("countrySuggestions");
const locationSuggestions = $("locationSuggestions");
const birdSuggestions = $("birdSuggestions");

const countrySelectedEl = $("countrySelected");
const locationSelectedEl = $("locationSelected");
const birdSelectedEl = $("birdSelected");

const resultsBody = $("resultsBody");
const statusEl = $("status");
const summaryEl = $("summary");

let searchMode = "location";
let locationBirdMode = "all";

let selectedCountry = null;
let selectedLocation = null;
let selectedBird = null;

let countryTimer;
let locationTimer;
let birdTimer;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function taxonomyCategoryLabel(category) {
  const labels = {
    species: "Species",
    issf: "Subspecies / identifiable form",
    slash: "Species pair",
    spuh: "Unidentified group",
    hybrid: "Hybrid",
    domestic: "Domestic form",
    form: "Form",
    intergrade: "Intergrade"
  };
  return labels[String(category || "").toLowerCase()] || "Taxon";
}

function setSuggestionLayer(box, isOpen) {
  const section = box.closest(".search-section");
  if (section) section.classList.toggle("dropdown-open", Boolean(isOpen));
}

function clear(box) {
  box.innerHTML = "";
  box.classList.add("hidden");
  setSuggestionLayer(box, false);
}

function showMessage(box, message) {
  box.innerHTML = `<div class="no-result">${esc(message)}</div>`;
  box.classList.remove("hidden");
  setSuggestionLayer(box, true);
}

function resetResults() {
  statusEl.textContent = "Ready";
  summaryEl.textContent = "";
  resultsBody.innerHTML = "";
}

function resetCountry() {
  selectedCountry = null;
  countryInput.value = "";
  countrySelectedEl.textContent = "";
  clear(countrySuggestions);
}

function resetLocation() {
  selectedLocation = null;
  locationInput.value = "";
  locationSelectedEl.textContent = "";
  clear(locationSuggestions);
}

function resetBird() {
  selectedBird = null;
  birdInput.value = "";
  birdSelectedEl.textContent = "";
  clear(birdSuggestions);
}

function getLocationBirdMode() {
  const checked = document.querySelector(
    'input[name="locationBirdMode"]:checked'
  );
  return checked ? checked.value : "all";
}

function syncLocationBirdChoice() {
  locationBirdMode = getLocationBirdMode();

  if (searchMode !== "location") return;

  resetBird();

  if (locationBirdMode === "all") {
    birdInput.disabled = true;
    birdInput.placeholder = "All Birds selected";
    birdRequiredMark.textContent = "";
  } else {
    birdRequiredMark.textContent = "*";
    birdInput.disabled = !selectedLocation;
    birdInput.placeholder = selectedLocation
      ? "e.g. hummingbird, eagle, bald, ruby"
      : "Select a location first";
  }

  resetResults();
}

function setMode(mode) {
  searchMode = mode;
  const locationFirst = mode === "location";

  modeLocation.classList.toggle("active", locationFirst);
  modeBird.classList.toggle("active", !locationFirst);

  modeLocation.setAttribute("aria-pressed", String(locationFirst));
  modeBird.setAttribute("aria-pressed", String(!locationFirst));

  locationSection.style.order = locationFirst ? "1" : "2";
  birdSection.style.order = locationFirst ? "2" : "1";

  if (locationFirst) {
    modeHelp.textContent =
      "Choose radius and recent period first, then select a country and location. Then search All Birds or choose a specific bird.";

    locationBirdChoice.classList.remove("hidden");
    mandatoryText.textContent =
      "* Country and location are mandatory. Bird is optional when All Birds is selected.";

    resetBird();

    countryInput.disabled = false;
    countryInput.placeholder = "e.g. Canada, Costa Rica, India";

    locationInput.disabled = !selectedCountry;
    locationInput.placeholder = selectedCountry
      ? "e.g. Kota, Arenal, Woodstock"
      : "Select country first";

    syncLocationBirdChoice();
  } else {
    modeHelp.textContent =
      "Choose a bird species or broad group first. Groups are built from eBird taxonomy, for example All Hummingbirds, All Tanagers, All Eagles, All Storks, and All Flamingos.";

    locationBirdChoice.classList.add("hidden");
    mandatoryText.textContent =
      "* Bird, country and location are mandatory in Bird search.";

    birdRequiredMark.textContent = "*";

    resetCountry();
    resetLocation();
    resetBird();

    countryInput.disabled = true;
    countryInput.placeholder = "Select a bird first";

    locationInput.disabled = true;
    locationInput.placeholder = "Select country first";

    birdInput.disabled = false;
    birdInput.placeholder = "e.g. hummingbird, tanager, eagle, stork, robin, bald";
  }

  resetResults();
}

modeLocation.addEventListener("click", () => setMode("location"));
modeBird.addEventListener("click", () => setMode("bird"));

document
  .querySelectorAll('input[name="locationBirdMode"]')
  .forEach((radio) => {
    radio.addEventListener("change", syncLocationBirdChoice);
  });

clearSearchButton.addEventListener("click", () => {
  clearTimeout(countryTimer);
  clearTimeout(locationTimer);
  clearTimeout(birdTimer);

  resetCountry();
  resetLocation();
  resetBird();

  $("dist").value = "15";
  $("back").value = "30";

  const allBirdsRadio = document.querySelector(
    'input[name="locationBirdMode"][value="all"]'
  );
  if (allBirdsRadio) allBirdsRadio.checked = true;

  locationBirdMode = "all";

  setMode("location");

  countryInput.focus();
});

function addSuggestionHeading(box, text) {
  const heading = document.createElement("div");
  heading.className = "suggestion-heading";
  heading.textContent = text;
  box.appendChild(heading);
}

function showCountries(rows) {
  countrySuggestions.innerHTML = "";

  if (!rows.length) {
    return showMessage(
      countrySuggestions,
      searchMode === "bird"
        ? "No matching countries were found for the selected bird."
        : "No matching countries found."
    );
  }

  rows.forEach((country) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";

    button.innerHTML = `
      <strong>${esc(country.name)}</strong>
      <small>${esc(country.code)}</small>
    `;

    button.onclick = () => {
      selectedCountry = country;
      countryInput.value = country.name;
      countrySelectedEl.textContent = country.code;

      resetLocation();

      locationInput.disabled = false;
      locationInput.placeholder =
        "Type a city, area or eBird hotspot";

      clear(countrySuggestions);
      locationInput.focus();
    };

    countrySuggestions.appendChild(button);
  });

  countrySuggestions.classList.remove("hidden");
  setSuggestionLayer(countrySuggestions, true);
}

function showLocations(rows) {
  locationSuggestions.innerHTML = "";

  if (!rows.length) {
    return showMessage(
      locationSuggestions,
      searchMode === "bird"
        ? "No matching area or recent eBird hotspot was found."
        : "No matching locations or eBird hotspots found in this country."
    );
  }

  const areas = rows.filter((location) => location.category === "area");
  const hotspots = rows.filter((location) => location.category === "hotspot");

  function appendLocation(location) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";

    button.innerHTML = `
      <strong>${esc(location.name)}</strong>
      <small>${esc(location.type)} · ${esc(location.source)}</small>
    `;

    button.onclick = () => {
      selectedLocation = location;
      locationInput.value = location.name;
      locationSelectedEl.textContent =
        `${location.type} · ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

      clear(locationSuggestions);

      if (searchMode === "location") {
        resetBird();

        if (locationBirdMode === "specific") {
          birdInput.disabled = false;
          birdInput.placeholder =
            "e.g. hummingbird, tanager, eagle, stork, bald, ruby";
          birdInput.focus();
        } else {
          birdInput.disabled = true;
          birdInput.placeholder = "All Birds selected";
        }
      }
    };

    locationSuggestions.appendChild(button);
  }

  if (areas.length) {
    addSuggestionHeading(locationSuggestions, "Area / city");
    areas.forEach(appendLocation);
  }

  if (hotspots.length) {
    addSuggestionHeading(
      locationSuggestions,
      searchMode === "bird"
        ? "eBird hotspots with recent matching observations"
        : "eBird hotspots"
    );
    hotspots.forEach(appendLocation);
  }

  locationSuggestions.classList.remove("hidden");
  setSuggestionLayer(locationSuggestions, true);
}

function showBirds(rows) {
  birdSuggestions.innerHTML = "";

  if (!rows.length) {
    return showMessage(
      birdSuggestions,
      searchMode === "location"
        ? "No matching birds recently reported in this area."
        : "No matching bird was found."
    );
  }

  const groups = rows.filter((bird) => bird.kind === "group");
  const species = rows.filter((bird) => bird.kind !== "group");

  function appendBird(bird) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      `suggestion ${bird.kind === "group" ? "group-suggestion" : ""}`;

    let context = "";

    if (
      bird.kind === "group" &&
      Number.isFinite(Number(bird.nearbySpeciesCount)) &&
      searchMode === "location"
    ) {
      context =
        ` · ${bird.nearbySpeciesCount} matching species reported nearby`;
    }

    if (bird.reportedNearby) {
      context += " · reported nearby";
    }

    if (bird.kind !== "group") {
      context = ` · ${taxonomyCategoryLabel(bird.category)}${context}`;
    } else if (Number.isFinite(Number(bird.groupMemberCount))) {
      context += ` · ${bird.groupMemberCount} taxonomy entries in group`;
    }

    button.innerHTML = `
      <strong>${esc(bird.commonName)}</strong>
      <small>${esc(bird.scientificName)}${esc(context)}</small>
    `;

    button.onclick = () => {
      selectedBird = bird;
      birdInput.value = bird.commonName;

      birdSelectedEl.textContent =
        bird.kind === "group"
          ? "Search all matching species"
          : bird.scientificName;

      clear(birdSuggestions);

      if (searchMode === "bird") {
        resetCountry();
        resetLocation();

        countryInput.disabled = false;
        countryInput.placeholder =
          "e.g. Canada, Costa Rica, Cuba";

        countryInput.focus();
      }
    };

    birdSuggestions.appendChild(button);
  }

  if (groups.length) {
    addSuggestionHeading(birdSuggestions, "Bird group");
    groups.forEach(appendBird);
  }

  if (species.length) {
    addSuggestionHeading(
      birdSuggestions,
      searchMode === "location"
        ? "Species / subspecies reported nearby"
        : "Species / subspecies"
    );
    species.forEach(appendBird);
  }

  birdSuggestions.classList.remove("hidden");
  setSuggestionLayer(birdSuggestions, true);
}

countryInput.addEventListener("input", () => {
  selectedCountry = null;
  countrySelectedEl.textContent = "";

  resetLocation();

  locationInput.disabled = true;
  locationInput.placeholder = "Select country first";

  if (searchMode === "location") {
    resetBird();

    if (locationBirdMode === "specific") {
      birdInput.disabled = true;
      birdInput.placeholder = "Select a location first";
    }
  }

  clearTimeout(countryTimer);

  const q = countryInput.value.trim();

  if (q.length < 1) {
    return clear(countrySuggestions);
  }

  countryTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({ q });

      if (searchMode === "bird" && selectedBird) {
        params.set("filterByBird", "true");
        params.set("birdKind", selectedBird.kind || "species");
        params.set("speciesCode", selectedBird.speciesCode || "");
        params.set("groupKey", selectedBird.groupKey || "");
        params.set("back", $("back").value);
      }

      const response = await fetch(`/api/countries?${params}`);
      const payload = await response.json();

      if (!payload.ok) throw new Error(payload.error);

      showCountries(payload.countries);
    } catch (error) {
      showMessage(countrySuggestions, error.message);
    }
  }, 250);
});

locationInput.addEventListener("input", () => {
  selectedLocation = null;
  locationSelectedEl.textContent = "";

  if (searchMode === "location") {
    resetBird();

    if (locationBirdMode === "specific") {
      birdInput.disabled = true;
      birdInput.placeholder = "Select a location first";
    }
  }

  clearTimeout(locationTimer);

  const q = locationInput.value.trim();

  if (q.length < 2 || !selectedCountry) {
    return clear(locationSuggestions);
  }

  locationTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        q,
        countryCode: selectedCountry.code,
        back: $("back").value,
        dist: $("dist").value
      });

      if (searchMode === "bird" && selectedBird) {
        params.set("filterByBird", "true");
        params.set("birdKind", selectedBird.kind || "species");
        params.set("speciesCode", selectedBird.speciesCode || "");
        params.set("groupKey", selectedBird.groupKey || "");
      }

      const response = await fetch(`/api/locations?${params}`);
      const payload = await response.json();

      if (!payload.ok) throw new Error(payload.error);

      showLocations(payload.locations);
    } catch (error) {
      showMessage(locationSuggestions, error.message);
    }
  }, 700);
});

birdInput.addEventListener("input", () => {
  selectedBird = null;
  birdSelectedEl.textContent = "";

  if (searchMode === "bird") {
    resetCountry();
    resetLocation();

    countryInput.disabled = true;
    countryInput.placeholder = "Select a bird first";
  }

  clearTimeout(birdTimer);

  const q = birdInput.value.trim();

  if (q.length < 2) {
    return clear(birdSuggestions);
  }

  if (searchMode === "location" && !selectedLocation) {
    return clear(birdSuggestions);
  }

  birdTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        q,
        dist: $("dist").value,
        back: $("back").value
      });

      if (searchMode === "location") {
        params.set("lat", selectedLocation.lat);
        params.set("lng", selectedLocation.lng);
      }

      const response = await fetch(`/api/birds?${params}`);
      const payload = await response.json();

      if (!payload.ok) throw new Error(payload.error);

      showBirds(payload.birds);
    } catch (error) {
      showMessage(birdSuggestions, error.message);
    }
  }, 300);
});

$("dist").addEventListener("change", () => {
  // Radius changes the search boundary, not the user's selected place.
  // Keep bird, country and location intact so the user can simply search again.
  resetResults();
});

$("back").addEventListener("change", () => {
  // Recent period changes the time window, not the user's selected place.
  // Keep bird, country and location intact so the user can simply search again.
  resetResults();
});

document.addEventListener("click", (event) => {
  [
    [countryInput, countrySuggestions],
    [locationInput, locationSuggestions],
    [birdInput, birdSuggestions]
  ].forEach(([input, box]) => {
    if (event.target !== input && !box.contains(event.target)) {
      clear(box);
    }
  });
});

function render(rows) {
  resultsBody.innerHTML = "";

  if (!rows.length) {
    resultsBody.innerHTML =
      '<tr><td colspan="5">No sightings returned for this search.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong>${esc(row.commonName)}</strong><br>
        <small>${esc(row.scientificName || "")}</small>
      </td>
      <td>${esc(row.dateTime)}</td>
      <td>${esc(row.count ?? "Not reported")}</td>
      <td>${esc(row.locationName)}</td>
      <td>${row.privateLocation ? "Yes" : "No"}</td>
    `;

    resultsBody.appendChild(tr);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const allBirds =
    searchMode === "location" &&
    locationBirdMode === "all";

  if (!selectedCountry || !selectedLocation) {
    statusEl.textContent = "Waiting";
    summaryEl.textContent =
      "Please select a country and location from the suggestions.";
    resultsBody.innerHTML = "";
    return;
  }

  if (!allBirds && !selectedBird) {
    statusEl.textContent = "Waiting";
    summaryEl.textContent =
      "Please select a bird or bird group from the suggestions.";
    resultsBody.innerHTML = "";
    return;
  }

  statusEl.textContent = "Loading...";
  summaryEl.textContent = "";
  resultsBody.innerHTML = "";

  const params = new URLSearchParams({
    kind: allBirds
      ? "all"
      : selectedBird.kind || "species",
    speciesCode: allBirds
      ? ""
      : selectedBird.speciesCode || "",
    groupKey: allBirds
      ? ""
      : selectedBird.groupKey || "",
    commonName: allBirds
      ? "All Birds"
      : selectedBird.commonName,
    lat: selectedLocation.lat,
    lng: selectedLocation.lng,
    locationName: selectedLocation.name,
    dist: $("dist").value,
    back: $("back").value
  });

  try {
    const response = await fetch(`/api/sightings?${params}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Search failed.");
    }

    if (allBirds) {
      summaryEl.textContent =
        `${payload.speciesCount} bird species returned within ${$("dist").value} km of ${selectedLocation.name} for the last ${$("back").value} day(s).`;
    } else if (selectedBird.kind === "group") {
      summaryEl.textContent =
        `${payload.speciesCount} matching species and ${payload.count} recent observation record(s) within ${$("dist").value} km of ${selectedLocation.name}.`;
    } else {
      summaryEl.textContent =
        `${payload.count} recent ${selectedBird.commonName} sighting location record(s) returned around ${selectedLocation.name}.`;
    }

    render(payload.sightings);
    statusEl.textContent = "Complete";
  } catch (error) {
    statusEl.textContent = "Error";
    summaryEl.textContent = error.message;
  }
});

setMode("location");
