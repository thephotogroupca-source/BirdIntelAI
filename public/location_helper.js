(function () {
  const findButton = document.getElementById("findLocationHelperButton");
  const modal = document.getElementById("locationHelperModal");
  const summary = document.getElementById("locationHelperSummary");
  const filterInput = document.getElementById("locationHelperFilter");
  const list = document.getElementById("locationHelperList");
  const range = document.getElementById("locationHelperRange");
  const closeButton = document.getElementById("locationHelperClose");
  const prevButton = document.getElementById("locationHelperPrev");
  const nextButton = document.getElementById("locationHelperNext");

  if (!findButton || !modal || !summary || !filterInput || !list || !range) return;

  let locations = [];
  let pageStart = 0;

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function locationMatchesFilter(location, filterText) {
    const q = normalize(filterText);
    if (!q) return true;

    const fields = [
      location.name,
      location.regionCode,
      location.regionName
    ].map(normalize);

    return fields.some((field) => field.includes(q));
  }

  function filteredLocations() {
    return locations.filter((location) =>
      locationMatchesFilter(location, filterInput.value)
    );
  }

  function canShowFindButton() {
    return (
      typeof searchMode !== "undefined" &&
      searchMode === "bird"
    );
  }

  function syncFindButton() {
    const shouldShow = canShowFindButton();
    findButton.classList.toggle("hidden", !shouldShow);
    findButton.disabled = !shouldShow || !selectedBird || !selectedCountry;
  }

  function openModal() {
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  function setMessage(message) {
    if (typeof statusEl !== "undefined") statusEl.textContent = "Waiting";
    if (typeof summaryEl !== "undefined") summaryEl.textContent = message;
  }

  function renderPage() {
    const visibleLocations = filteredLocations();
    const total = visibleLocations.length;

    if (!total) {
      list.innerHTML = '<div class="no-result">No matching locations found.</div>';
      range.textContent = "";
      prevButton.disabled = true;
      nextButton.disabled = true;
      return;
    }

    const page = visibleLocations.slice(pageStart, pageStart + 10);
    list.innerHTML = page.map((location, index) => `
      <button type="button" class="location-helper-option" data-index="${index}">
        ${esc(location.name)}
      </button>
    `).join("");

    list.querySelectorAll(".location-helper-option").forEach((button) => {
      button.addEventListener("click", () => {
        const location = page[Number(button.dataset.index)];
        if (!location) return;
        selectedLocation = {
          name: location.name,
          lat: Number(location.lat),
          lng: Number(location.lng),
          type: location.locationId ? "eBird location / hotspot" : "eBird location",
          source: "eBird",
          locationId: location.locationId || "",
          category: "hotspot"
        };

        locationInput.value = selectedLocation.name;
        locationSelectedEl.textContent =
          `${selectedLocation.type} · ${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`;
        if (typeof syncBirdModeLocationControl === "function") {
          syncBirdModeLocationControl();
        }
        clear(locationSuggestions);
        closeModal();
        resetResults();
      });
    });

    const first = pageStart + 1;
    const last = Math.min(pageStart + page.length, total);
    range.textContent = `${first}-${last} of ${total}`;
    prevButton.disabled = pageStart === 0;
    nextButton.disabled = pageStart + 10 >= total;
  }

  async function findLocations() {
    syncFindButton();

    if (typeof searchMode !== "undefined" && searchMode !== "bird") {
      setMessage("Use Bird mode first, then select one bird and country.");
      return;
    }

    if (!selectedBird) {
      setMessage("Please select one bird or bird group first.");
      return;
    }

    if (!selectedCountry) {
      setMessage("Please select a country first.");
      return;
    }

    findButton.disabled = true;
    findButton.textContent = "Finding...";
    if (typeof statusEl !== "undefined") statusEl.textContent = "Loading...";
    if (typeof summaryEl !== "undefined") summaryEl.textContent = "";

    const params = new URLSearchParams({
      countryCode: selectedCountry.code || "",
      kind: selectedBird.kind || "species",
      speciesCode: selectedBird.speciesCode || "",
      groupKey: selectedBird.groupKey || "",
      back: document.getElementById("back").value
    });

    try {
      const response = await fetch(`/api/location-helper/locations?${params}`);
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Find location failed.");
      }

      locations = payload.locations || [];
      pageStart = 0;
      filterInput.value = "";
      summary.textContent =
        `${selectedBird.commonName} in ${selectedCountry.name}, last ${document.getElementById("back").value} day(s).`;
      renderPage();
      openModal();

      if (typeof statusEl !== "undefined") statusEl.textContent = "Ready";
      if (typeof summaryEl !== "undefined") {
        summaryEl.textContent =
          `${locations.length} recent location name(s) found. Select one from the popup, then click Get sightings.`;
      }
    } catch (error) {
      if (typeof statusEl !== "undefined") statusEl.textContent = "Error";
      if (typeof summaryEl !== "undefined") summaryEl.textContent = error.message;
    } finally {
      findButton.textContent = "Find the location";
      syncFindButton();
    }
  }

  findButton.addEventListener("click", findLocations);

  ["click", "input", "change"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      setTimeout(syncFindButton, 0);
    });
  });

  syncFindButton();

  closeButton.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  prevButton.addEventListener("click", () => {
    pageStart = Math.max(0, pageStart - 10);
    renderPage();
  });

  nextButton.addEventListener("click", () => {
    if (pageStart + 10 < filteredLocations().length) {
      pageStart += 10;
      renderPage();
    }
  });

  filterInput.addEventListener("input", () => {
    pageStart = 0;
    renderPage();
  });
})();
