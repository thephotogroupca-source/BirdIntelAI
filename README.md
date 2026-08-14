# BirdIntelAI v1.1

BirdIntelAI v1.1 is based on the uploaded and tested v1.0 WKH Branded Refined build.

## Changes in v1.1

### 1. Search workflow

Location controls now appear in this order on desktop:

**Radius -> Recent period -> Country -> Location / hotspot**

This lets the user choose the search distance and time window before choosing geography.

Changing **Radius** or **Recent period** no longer clears the selected bird, country, or location. The user can change either value and simply run the search again.

### 2. Complete bird-group sighting retrieval

A group search such as **All Toucans**, **All Kingfishers**, **All Hummingbirds**, or **All Tanagers** no longer stops at the single recent record returned for each species by eBird's general nearby endpoint.

The app now:
1. Finds which members of the selected group occur in the chosen area and period.
2. Runs the species-specific nearby search for each matching species.
3. Combines and de-duplicates the returned sighting-location records.
4. Sorts the combined results by bird name and date.

This keeps broad group searches useful while avoiding calls for taxonomy members that are not present in the selected area.

### 3. Bird-first location matching for groups

For a broad bird group, the app no longer pre-filters hotspot names using only one country-level record per species. Candidate locations are instead checked against the selected group, radius, and recent period before being shown. This prevents valid locations from being hidden merely because another location held the species' most recent country-level record.

### 4. Autocomplete layering

Bird, country, and location suggestion lists are explicitly raised above the cards below them while open. This fixes the dropdown being hidden behind the Location or Results card.

### 5. WKH header

The Wildlife Knowledge Hub brand remains dominant, with the WKH logo, brand name, tagline, and the smaller **Recent bird sightings** page title below it.

## Defaults

Radius: **15 km**

Recent period: **30 days**

## Setup

1. Extract the ZIP under `BirdIntelAI/Versions/`.
2. Copy your existing `.env` into the `BirdIntelAI_v1.1` folder, or create one from `.env.example`.
3. Keep the eBird API key only in `.env`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3001`.

`.env` is intentionally excluded from the ZIP.


## v3.0 test
Bird names in results are clickable. The species view now uses the existing Wildlife Knowledge Hub Ask backend for the text profile and Wikimedia Commons for an openly licensed image when available. Bird Intel AI does not require its own OpenAI API key. The official eBird species link remains available.


## Firmware 2.7 Snowcap profile test

The profile text is requested server-to-server from `WKH_ASK_API_URL`, which defaults to `https://ask.wildlifeknowledgehub.com/api/chat`. This reuses the existing WKH Ask OpenAI connection and knowledge workflow. The image lookup remains separate and uses Wikimedia Commons licensing metadata.


## v3.0.1 fixes
- Results chat sends a compact Bird Intel context to WKH Ask to avoid rejected oversized/complex requests.
- The “Ask WKH about this bird” button appears only after the automatic bird profile has finished loading.


## v3.0 video handoff
Bird profile chat remains focused on species questions. Video, YouTube, footage, watch, and clip requests are handled locally and are not sent to the lightweight Bird Intel chat API. The user is gently offered Yes/No controls to open the full WKH Ask experience at https://ask.wildlifeknowledgehub.com/. Choosing No keeps the user on the bird profile and invites another species question.
