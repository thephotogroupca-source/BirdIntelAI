let lastNominatimRequestAt = 0;

const hotspotCache = new Map();
const HOTSPOT_CACHE_MS = 6 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const COUNTRIES = [
  ["AF","Afghanistan"],["AL","Albania"],["DZ","Algeria"],["AD","Andorra"],
  ["AO","Angola"],["AG","Antigua and Barbuda"],["AR","Argentina"],["AM","Armenia"],
  ["AU","Australia"],["AT","Austria"],["AZ","Azerbaijan"],["BS","Bahamas"],
  ["BH","Bahrain"],["BD","Bangladesh"],["BB","Barbados"],["BY","Belarus"],
  ["BE","Belgium"],["BZ","Belize"],["BJ","Benin"],["BT","Bhutan"],
  ["BO","Bolivia"],["BA","Bosnia and Herzegovina"],["BW","Botswana"],["BR","Brazil"],
  ["BN","Brunei"],["BG","Bulgaria"],["BF","Burkina Faso"],["BI","Burundi"],
  ["CV","Cabo Verde"],["KH","Cambodia"],["CM","Cameroon"],["CA","Canada"],
  ["CF","Central African Republic"],["TD","Chad"],["CL","Chile"],["CN","China"],
  ["CO","Colombia"],["KM","Comoros"],["CG","Congo"],["CD","Democratic Republic of the Congo"],
  ["CR","Costa Rica"],["CI","Cote d'Ivoire"],["HR","Croatia"],["CU","Cuba"],
  ["CY","Cyprus"],["CZ","Czechia"],["DK","Denmark"],["DJ","Djibouti"],
  ["DM","Dominica"],["DO","Dominican Republic"],["EC","Ecuador"],["EG","Egypt"],
  ["SV","El Salvador"],["GQ","Equatorial Guinea"],["ER","Eritrea"],["EE","Estonia"],
  ["SZ","Eswatini"],["ET","Ethiopia"],["FJ","Fiji"],["FI","Finland"],
  ["FR","France"],["GA","Gabon"],["GM","Gambia"],["GE","Georgia"],
  ["DE","Germany"],["GH","Ghana"],["GR","Greece"],["GD","Grenada"],
  ["GT","Guatemala"],["GN","Guinea"],["GW","Guinea-Bissau"],["GY","Guyana"],
  ["HT","Haiti"],["HN","Honduras"],["HU","Hungary"],["IS","Iceland"],
  ["IN","India"],["ID","Indonesia"],["IR","Iran"],["IQ","Iraq"],
  ["IE","Ireland"],["IL","Israel"],["IT","Italy"],["JM","Jamaica"],
  ["JP","Japan"],["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],
  ["KI","Kiribati"],["KW","Kuwait"],["KG","Kyrgyzstan"],["LA","Laos"],
  ["LV","Latvia"],["LB","Lebanon"],["LS","Lesotho"],["LR","Liberia"],
  ["LY","Libya"],["LI","Liechtenstein"],["LT","Lithuania"],["LU","Luxembourg"],
  ["MG","Madagascar"],["MW","Malawi"],["MY","Malaysia"],["MV","Maldives"],
  ["ML","Mali"],["MT","Malta"],["MH","Marshall Islands"],["MR","Mauritania"],
  ["MU","Mauritius"],["MX","Mexico"],["FM","Micronesia"],["MD","Moldova"],
  ["MC","Monaco"],["MN","Mongolia"],["ME","Montenegro"],["MA","Morocco"],
  ["MZ","Mozambique"],["MM","Myanmar"],["NA","Namibia"],["NR","Nauru"],
  ["NP","Nepal"],["NL","Netherlands"],["NZ","New Zealand"],["NI","Nicaragua"],
  ["NE","Niger"],["NG","Nigeria"],["KP","North Korea"],["MK","North Macedonia"],
  ["NO","Norway"],["OM","Oman"],["PK","Pakistan"],["PW","Palau"],
  ["PA","Panama"],["PG","Papua New Guinea"],["PY","Paraguay"],["PE","Peru"],
  ["PH","Philippines"],["PL","Poland"],["PT","Portugal"],["QA","Qatar"],
  ["RO","Romania"],["RU","Russia"],["RW","Rwanda"],["KN","Saint Kitts and Nevis"],
  ["LC","Saint Lucia"],["VC","Saint Vincent and the Grenadines"],["WS","Samoa"],
  ["SM","San Marino"],["ST","Sao Tome and Principe"],["SA","Saudi Arabia"],
  ["SN","Senegal"],["RS","Serbia"],["SC","Seychelles"],["SL","Sierra Leone"],
  ["SG","Singapore"],["SK","Slovakia"],["SI","Slovenia"],["SB","Solomon Islands"],
  ["SO","Somalia"],["ZA","South Africa"],["KR","South Korea"],["SS","South Sudan"],
  ["ES","Spain"],["LK","Sri Lanka"],["SD","Sudan"],["SR","Suriname"],
  ["SE","Sweden"],["CH","Switzerland"],["SY","Syria"],["TW","Taiwan"],
  ["TJ","Tajikistan"],["TZ","Tanzania"],["TH","Thailand"],["TL","Timor-Leste"],
  ["TG","Togo"],["TO","Tonga"],["TT","Trinidad and Tobago"],["TN","Tunisia"],
  ["TR","Turkey"],["TM","Turkmenistan"],["TV","Tuvalu"],["UG","Uganda"],
  ["UA","Ukraine"],["AE","United Arab Emirates"],["GB","United Kingdom"],
  ["US","United States"],["UY","Uruguay"],["UZ","Uzbekistan"],["VU","Vanuatu"],
  ["VA","Vatican City"],["VE","Venezuela"],["VN","Vietnam"],["YE","Yemen"],
  ["ZM","Zambia"],["ZW","Zimbabwe"]
].map(([code, name]) => ({ code, name }));

function searchCountries(query) {
  const q = normalize(query);
  if (!q) return [];

  return COUNTRIES
    .map((country) => {
      const name = normalize(country.name);
      let score = 0;

      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 90;
      else if (name.split(/\s+/).some((word) => word.startsWith(q))) score = 80;
      else if (name.includes(q)) score = 70;

      return { ...country, score };
    })
    .filter((country) => country.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 20)
    .map(({ score, ...country }) => country);
}

async function nominatimSearch(params, userAgent) {
  const wait = Math.max(
    0,
    1000 - (Date.now() - lastNominatimRequestAt)
  );

  if (wait) await sleep(wait);
  lastNominatimRequestAt = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/search");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": "en"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(
      `Location search returned ${response.status}. ${body.slice(0, 200)}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function loadCountryHotspots({ countryCode, apiKey }) {
  const code = String(countryCode || "").toUpperCase();

  if (!code || !apiKey) return [];

  const cached = hotspotCache.get(code);

  if (cached && Date.now() - cached.at < HOTSPOT_CACHE_MS) {
    return cached.rows;
  }

  const url = new URL(
    `https://api.ebird.org/v2/ref/hotspot/${encodeURIComponent(code)}`
  );
  url.searchParams.set("fmt", "json");

  const response = await fetch(url, {
    headers: {
      "X-eBirdApiToken": apiKey
    }
  });

  if (!response.ok) return [];

  const rows = await response.json();

  hotspotCache.set(code, {
    at: Date.now(),
    rows
  });

  return rows;
}

async function searchPlaces({
  query,
  countryCode,
  userAgent,
  apiKey,
  allowedHotspotIds = null
}) {
  const q = String(query || "").trim();
  const country = String(countryCode || "").trim().toLowerCase();

  if (q.length < 2 || !country) return [];

  const [geoRows, hotspotRows] = await Promise.all([
    nominatimSearch(
      {
        q,
        countrycodes: country,
        limit: "10"
      },
      userAgent
    ),
    loadCountryHotspots({
      countryCode: country,
      apiKey
    })
  ]);

  const nq = normalize(q);

  let matchingHotspots = hotspotRows.filter((row) =>
    normalize(row.locName).includes(nq)
  );

  if (allowedHotspotIds instanceof Set) {
    matchingHotspots = matchingHotspots.filter((row) =>
      allowedHotspotIds.has(row.locId)
    );
  }

  const hotspots = matchingHotspots.slice(0, 16).map((row) => ({
    name: row.locName,
    lat: Number(row.lat),
    lng: Number(row.lng),
    type: "eBird hotspot",
    source: "eBird",
    locationId: row.locId || "",
    category: "hotspot"
  }));

  /*
    General geographic results stay available intentionally.
    This is the "all Kota" or "all Arenal" behaviour:
    choose the city/area as a centre point, then use Radius.
  */
  const areas = geoRows.map((row) => ({
    name: row.display_name,
    lat: Number(row.lat),
    lng: Number(row.lon),
    type: row.type || "area / place",
    source: "OpenStreetMap",
    locationId: "",
    category: "area"
  }));

  const combined = [...areas, ...hotspots];
  const seen = new Set();

  return combined
    .filter((row) => {
      const key = [
        normalize(row.name),
        row.lat.toFixed(4),
        row.lng.toFixed(4)
      ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 22);
}

module.exports = {
  searchCountries,
  searchPlaces
};
