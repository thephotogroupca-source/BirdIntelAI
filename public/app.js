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
const getSightingsButton = $("getSightingsButton");
const groupSearchNotice = $("groupSearchNotice");

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
const resultTools = $("resultTools");
const filterBird = $("filterBird");
const filterLocation = $("filterLocation");
const filterPrivate = $("filterPrivate");
const clearFiltersButton = $("clearFilters");
const downloadCsvButton = $("downloadCsv");
const filteredSummary = $("filteredSummary");
const birdProfileHint = $("birdProfileHint");

let allResultRows = [];
let sortKey = "dateTime";
let sortDirection = "desc";

let searchMode = "location";
let locationBirdMode = "all";

let selectedCountry = null;
let selectedLocation = null;
let selectedBird = null;

let countryTimer;
let locationTimer;
let birdTimer;
let countryRequestId = 0;
let locationRequestId = 0;

const BIRD_INTEL_RETURN_PREFIX = "birdIntel.returnState.v11_6.";

function createReturnId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function saveBirdIntelReturnState(link) {
  try {
    const returnId = createReturnId();
    const state = {
      searchMode,
      locationBirdMode,
      selectedCountry,
      selectedLocation,
      selectedBird,
      dist: $("dist").value,
      back: $("back").value,
      rows: allResultRows,
      summary: summaryEl.textContent,
      status: statusEl.textContent,
      sortKey,
      sortDirection,
      filters: {
        bird: filterBird.value,
        location: filterLocation.value,
        private: filterPrivate.value
      },
      savedAt: Date.now()
    };

    sessionStorage.setItem(
      `${BIRD_INTEL_RETURN_PREFIX}${returnId}`,
      JSON.stringify(state)
    );

    if (link) {
      const url = new URL(link.href, window.location.origin);
      url.searchParams.set("returnId", returnId);
      link.href = `${url.pathname}${url.search}`;
    }
    return returnId;
  } catch (_) {
    return null;
  }
}

function restoreBirdIntelReturnState() {
  try {
    const returnId = new URLSearchParams(window.location.search).get("returnId");
    if (!returnId) return false;

    const raw = sessionStorage.getItem(`${BIRD_INTEL_RETURN_PREFIX}${returnId}`);
    if (!raw) return false;
    const state = JSON.parse(raw);

    setMode(state.searchMode === "bird" ? "bird" : "location");
    searchMode = state.searchMode === "bird" ? "bird" : "location";
    locationBirdMode = state.locationBirdMode === "specific" ? "specific" : "all";
    selectedCountry = state.selectedCountry || null;
    selectedLocation = state.selectedLocation || null;
    selectedBird = state.selectedBird || null;

    $("dist").value = String(state.dist || "15");
    $("back").value = String(state.back || "30");
    countryInput.value = selectedCountry?.name || "";
    countrySelectedEl.textContent = selectedCountry?.code || "";
    locationInput.value = selectedLocation?.name || "";
    locationSelectedEl.textContent = selectedLocation
      ? `${selectedLocation.type || "Location"} · ${Number(selectedLocation.lat).toFixed(4)}, ${Number(selectedLocation.lng).toFixed(4)}`
      : "";
    birdInput.value = selectedBird?.commonName || "";
    birdSelectedEl.textContent = selectedBird?.scientificName || "";

    if (searchMode === "bird") {
      locationBirdChoice.classList.add("hidden");
      birdRequiredMark.textContent = "*";
      birdInput.disabled = false;
      countryInput.disabled = !selectedBird;
      countryInput.placeholder = selectedBird ? "Choose or type a country" : "Select a bird first";
      locationInput.disabled = !selectedCountry;
      locationInput.placeholder = selectedCountry ? "Choose or type a location / hotspot" : "Select country first";
      mandatoryText.textContent = "* Bird, country and location are mandatory in Bird search.";
      modeHelp.textContent = "Choose a bird species or broad group first. Groups are built from eBird taxonomy, for example All Hummingbirds, All Tanagers, All Eagles, All Storks, and All Flamingos.";
    } else {
      const radio = document.querySelector(`input[name="locationBirdMode"][value="${locationBirdMode}"]`);
      if (radio) radio.checked = true;
      locationBirdChoice.classList.remove("hidden");
      countryInput.disabled = false;
      locationInput.disabled = !selectedCountry;
      if (locationBirdMode === "all") {
        birdInput.disabled = true;
        birdInput.placeholder = "All Birds selected";
        birdRequiredMark.textContent = "";
      } else {
        birdInput.disabled = !selectedLocation;
        birdInput.placeholder = selectedLocation ? "e.g. hummingbird, eagle, bald, ruby" : "Select a location first";
        birdRequiredMark.textContent = "*";
      }
      mandatoryText.textContent = "* Country and location are mandatory. Bird is optional when All Birds is selected.";
      modeHelp.textContent = "Choose radius and recent period first, then select a country and location. Then search All Birds or choose a specific bird.";
    }

    sortKey = state.sortKey || "dateTime";
    sortDirection = state.sortDirection === "asc" ? "asc" : "desc";
    setResultRows(Array.isArray(state.rows) ? state.rows : []);
    if (state.filters) {
      filterBird.value = state.filters.bird || "";
      filterLocation.value = state.filters.location || "";
      filterPrivate.value = state.filters.private || "";
      applyResultView();
    }
    summaryEl.textContent = state.summary || "";
    statusEl.textContent = state.status || "Complete";
    syncGroupSearchNotice();
    clear(countrySuggestions);
    clear(locationSuggestions);
    clear(birdSuggestions);
    return true;
  } catch (error) {
    console.warn("Could not restore Bird Intel results state:", error);
    return false;
  }
}

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
  allResultRows = [];
  resultTools.classList.add("hidden");
  filteredSummary.textContent = "";
  filterBird.innerHTML = '<option value="">All Birds</option>';
  filterLocation.innerHTML = '<option value="">All Locations</option>';
  filterPrivate.value = "";
  if (birdProfileHint) birdProfileHint.classList.add("hidden");
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
  syncGroupSearchNotice();
}

function syncGroupSearchNotice() {
  const isGroupSearch =
    searchMode === "bird" && selectedBird?.kind === "group";
  groupSearchNotice.hidden = !isGroupSearch;
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
        searchMode === "bird"
          ? "Choose or type a location / hotspot"
          : "Type a city, area or eBird hotspot";

      // Close country suggestions and activate Location without opening it.
      countryRequestId += 1;
      clear(countrySuggestions);
      locationInput.focus({ preventScroll: true });
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
      syncGroupSearchNotice();

      if (searchMode === "bird") {
        resetCountry();
        resetLocation();

        countryInput.disabled = false;
        countryInput.placeholder =
          "Choose or type a country";

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


async function loadCountrySuggestions(query = "") {
  const requestId = ++countryRequestId;
  if (searchMode === "bird" && !selectedBird) {
    return clear(countrySuggestions);
  }

  try {
    if (!query) {
      showMessage(
        countrySuggestions,
        searchMode === "bird" && selectedBird?.kind !== "group"
          ? "Loading countries with recent sightings..."
          : "Loading countries..."
      );
    }

    const params = new URLSearchParams({ q: query });

    if (searchMode === "bird" && selectedBird) {
      // Specific species can load their valid countries immediately.
      // Groups only reach this function after the user types at least 1 character.
      params.set("filterByBird", "true");
      params.set("birdKind", selectedBird.kind || "species");
      params.set("speciesCode", selectedBird.speciesCode || "");
      params.set("groupKey", selectedBird.groupKey || "");
      params.set("back", $("back").value);
    }

    const response = await fetch(`/api/countries?${params}`);
    const payload = await response.json();
    if (requestId !== countryRequestId) return;
    if (!payload.ok) throw new Error(payload.error);
    // Ignore stale results if the input changed while the request was running.
    if (countryInput.value.trim().toLowerCase() !== query.trim().toLowerCase()) return;
    showCountries(payload.countries);
  } catch (error) {
    if (requestId !== countryRequestId) return;
    showMessage(countrySuggestions, error.message);
  }
}

async function loadLocationSuggestions(query = "") {
  const requestId = ++locationRequestId;
  if (!selectedCountry) return clear(locationSuggestions);

  if (!query && searchMode !== "bird") {
    return clear(locationSuggestions);
  }

  try {
    if (!query) {
      showMessage(locationSuggestions, "Loading recent locations...");
    }

    const params = new URLSearchParams({
      q: query,
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
    if (requestId !== locationRequestId) return;
    if (!payload.ok) throw new Error(payload.error);
    if (locationInput.value.trim().toLowerCase() !== query.trim().toLowerCase()) return;
    showLocations(payload.locations);
  } catch (error) {
    if (requestId !== locationRequestId) return;
    showMessage(locationSuggestions, error.message);
  }
}

countryInput.addEventListener("input", () => {
  countryRequestId += 1;
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

  countryTimer = setTimeout(() => {
    loadCountrySuggestions(q);
  }, 250);
});

locationInput.addEventListener("input", () => {
  locationRequestId += 1;
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

  locationTimer = setTimeout(() => {
    loadLocationSuggestions(q);
  }, 300);
});

countryInput.addEventListener("focus", () => {
  if (countryInput.disabled) return;
  if (
    searchMode === "bird" &&
    selectedBird &&
    selectedBird.kind !== "group" &&
    !countryInput.value.trim()
  ) {
    loadCountrySuggestions("");
  }
});

locationInput.addEventListener("focus", () => {
  // Do not automatically open locations after a country is selected.
  // Suggestions appear only after the user types in the Location field.
  if (locationInput.disabled || !selectedCountry) return;
});

$("back").addEventListener("change", () => {
  if (searchMode !== "bird" || !selectedBird) return;
  resetCountry();
  resetLocation();
  countryInput.disabled = false;
  countryInput.placeholder = "Choose or type a country";
  if (selectedBird.kind !== "group") {
    loadCountrySuggestions("");
  } else {
    clear(countrySuggestions);
  }
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

function compareRows(a, b) {
  let av = a[sortKey];
  let bv = b[sortKey];
  if (sortKey === "count") {
    av = av == null ? -1 : Number(av);
    bv = bv == null ? -1 : Number(bv);
    return (av - bv) * (sortDirection === "asc" ? 1 : -1);
  }
  const result = String(av || "").localeCompare(String(bv || ""), undefined, { numeric: true, sensitivity: "base" });
  return result * (sortDirection === "asc" ? 1 : -1);
}

function currentRows() {
  return allResultRows
    .filter((row) => !filterBird.value || row.commonName === filterBird.value)
    .filter((row) => !filterLocation.value || row.locationName === filterLocation.value)
    .filter((row) => !filterPrivate.value || (row.privateLocation ? "yes" : "no") === filterPrivate.value)
    .slice()
    .sort(compareRows);
}

function updateSortIndicators() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const indicator = button.querySelector("span");
    indicator.textContent = button.dataset.sort === sortKey
      ? (sortDirection === "asc" ? "▲" : "▼")
      : "";
  });
}

function render(rows) {
  resultsBody.innerHTML = "";
  if (!rows.length) {
    resultsBody.innerHTML = '<tr><td colspan="5">No sightings match the current filters.</td></tr>';
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a class="bird-profile-link" href="/species.html?speciesCode=${encodeURIComponent(row.speciesCode || "")}&commonName=${encodeURIComponent(row.commonName || "")}&scientificName=${encodeURIComponent(row.scientificName || "")}" title="View Cornell/eBird species information"><strong>${esc(row.commonName)}</strong></a><br><small>${esc(row.scientificName || "")}</small></td>
      <td>${esc(row.dateTime)}</td>
      <td>${esc(row.count ?? "Not reported")}</td>
      <td>${esc(row.locationName)}</td>
      <td>${row.privateLocation ? "Yes" : "No"}</td>`;
    resultsBody.appendChild(tr);
  });
}

resultsBody.addEventListener("click", (event) => {
  const link = event.target.closest("a.bird-profile-link");
  if (!link) return;

  // V11.6: make profile navigation deterministic. Do not let the browser
  // decide which href/history entry to use while we are creating the return
  // snapshot. Save the exact current result state first, attach its unique
  // returnId, then navigate explicitly to that Bird Profile.
  event.preventDefault();

  const returnId = saveBirdIntelReturnState();
  const url = new URL(link.href, window.location.origin);

  if (returnId) {
    url.searchParams.set("returnId", returnId);
  }

  window.location.assign(`${url.pathname}${url.search}`);
});

function applyResultView() {
  const selectedBirdFilter = filterBird.value;
  const selectedLocationFilter = filterLocation.value;
  const selectedPrivateFilter = filterPrivate.value;

  // Make Bird and Location true result filters. Each dropdown only shows
  // choices that remain possible after the other active filters are applied.
  const birdChoices = allResultRows
    .filter((row) => !selectedLocationFilter || row.locationName === selectedLocationFilter)
    .filter((row) => !selectedPrivateFilter || (row.privateLocation ? "yes" : "no") === selectedPrivateFilter)
    .map((row) => row.commonName);
  const locationChoices = allResultRows
    .filter((row) => !selectedBirdFilter || row.commonName === selectedBirdFilter)
    .filter((row) => !selectedPrivateFilter || (row.privateLocation ? "yes" : "no") === selectedPrivateFilter)
    .map((row) => row.locationName);

  fillFilter(filterBird, birdChoices, "All Birds");
  fillFilter(filterLocation, locationChoices, "All Locations");
  if ([...filterBird.options].some((o) => o.value === selectedBirdFilter)) filterBird.value = selectedBirdFilter;
  if ([...filterLocation.options].some((o) => o.value === selectedLocationFilter)) filterLocation.value = selectedLocationFilter;

  const rows = currentRows();
  render(rows);
  filteredSummary.textContent = (filterBird.value || filterLocation.value || filterPrivate.value)
    ? `Showing ${rows.length} of ${allResultRows.length} observation record(s).`
    : "";
  updateSortIndicators();
}

function fillFilter(select, values, allLabel) {
  select.innerHTML = `<option value="">${esc(allLabel)}</option>`;
  [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b)).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function setResultRows(rows) {
  allResultRows = Array.isArray(rows) ? rows : [];
  fillFilter(filterBird, allResultRows.map((row) => row.commonName), "All Birds");
  fillFilter(filterLocation, allResultRows.map((row) => row.locationName), "All Locations");
  filterBird.value = "";
  filterLocation.value = "";
  resultTools.classList.toggle("hidden", allResultRows.length === 0);
  if (birdProfileHint) birdProfileHint.classList.toggle("hidden", allResultRows.length === 0);
  applyResultView();
}

filterBird.addEventListener("change", applyResultView);
filterLocation.addEventListener("change", applyResultView);
filterPrivate.addEventListener("change", applyResultView);
clearFiltersButton.addEventListener("click", () => {
  filterBird.value = "";
  filterLocation.value = "";
  filterPrivate.value = "";
  applyResultView();
});

document.querySelectorAll(".sort-button").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (sortKey === key) sortDirection = sortDirection === "asc" ? "desc" : "asc";
    else {
      sortKey = key;
      sortDirection = key === "dateTime" || key === "count" ? "desc" : "asc";
    }
    applyResultView();
  });
});

downloadCsvButton.addEventListener("click", () => {
  const rows = currentRows();
  if (!rows.length) return;
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [["Bird", "Scientific Name", "Date and Time", "Count", "Location", "Private"]
    .map(csvCell).join(",")];
  rows.forEach((row) => lines.push([
    row.commonName, row.scientificName, row.dateTime,
    row.count ?? "", row.locationName, row.privateLocation ? "Yes" : "No"
  ].map(csvCell).join(",")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `BirdIntelAI_results_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

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

  const isGroupSearch = !allBirds && selectedBird?.kind === "group";
  statusEl.textContent = "Loading...";
  getSightingsButton.disabled = true;
  getSightingsButton.textContent = isGroupSearch
    ? "Searching group sightings…"
    : "Searching…";
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
    back: $("back").value,
    includePrivate: "yes"
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

    setResultRows(payload.sightings);
    statusEl.textContent = "Complete";
  } catch (error) {
    statusEl.textContent = "Error";
    summaryEl.textContent = error.message;
  } finally {
    getSightingsButton.disabled = false;
    getSightingsButton.textContent = "Get sightings";
  }
});


if (!restoreBirdIntelReturnState()) {
  setMode("location");
}
