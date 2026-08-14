const EXCLUDE_TERMS = [
  // Artwork and historical plates. Bird Profile should show real photographs only.
  "illustration", "illustrated", "illustrator", "drawing", "drawn", "painting", "painted",
  "lithograph", "chromolithograph", "engraving", "engraved", "etching", "woodcut",
  "watercolor", "watercolour", "gouache", "artwork", "sketch", "book plate",
  "colour plate", "color plate", "ornithological plate", "natural history plate",
  "hand-colored", "hand coloured", "hand-coloured", "print of", "antique print",
  "biodiversity heritage library", "bhl",

  // Non-live-bird material.
  "specimen", "museum specimen", "taxiderm", "skin specimen", "study skin",
  "range map", "distribution map", "map of", "stamp", "logo", "icon",
  "silhouette", "diagram"
];

const POSITIVE_PHOTO_TERMS = [
  "photograph", "photo", "male", "female", "adult", "juvenile", "perched",
  "feeding", "bird", "hummingbird"
];

const HERO_PHOTO_TERMS = [
  "portrait", "close-up", "close up", "closeup", "perched", "side view",
  "profile", "adult male", "adult female", "male", "female", "feeding",
  "on branch", "on perch", "head", "detail"
];

const HERO_PHOTO_PENALTY_TERMS = [
  "in flight", "flying", "flight", "distant", "far away", "landscape",
  "habitat", "forest", "canopy", "sky", "flock", "group of", "nest",
  "tree top", "treetop", "silhouette"
];

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": process.env.APP_USER_AGENT || "BirdIntelAI/10.0",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`External source returned ${response.status}.`);
  return response.json();
}

function normalize(value = "") {
  return stripHtml(value).toLowerCase();
}

function hasAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function nameTokens(value = "") {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4);
}

function candidateText(page, meta) {
  return normalize([
    page.title,
    meta.ObjectName?.value,
    meta.ImageDescription?.value,
    meta.Categories?.value,
    meta.DepictedPeople?.value,
    meta.Credit?.value,
    meta.Artist?.value
  ].filter(Boolean).join(" "));
}

function scoreCandidate({ page, info, meta, commonName, scientificName, sourceRank }) {
  const text = candidateText(page, meta);
  const title = normalize(page.title || "");
  const sci = normalize(scientificName);
  const common = normalize(commonName);
  const sciTokens = nameTokens(scientificName);
  const commonTokens = nameTokens(commonName);

  if (hasAny(text, EXCLUDE_TERMS)) return { reject: true, score: -999 };

  // Commons historical artwork is sometimes uploaded under a species name without
  // the word "painting" in the title. Public-domain files that also carry strong
  // archive/book/plate language are therefore rejected before scoring.
  const licenseText = normalize(meta.LicenseShortName?.value || meta.UsageTerms?.value || "");
  const historicalArchiveSignals = [
    "published", "publication", "book", "volume", "folio", "archive",
    "plate", "artist", "del.", "lith.", "sculp.", "fecit"
  ];
  if (licenseText.includes("public domain") && hasAny(text, historicalArchiveSignals) && !hasAny(text, ["photograph", "photo", "photographed", "camera"])) {
    return { reject: true, score: -999 };
  }

  let score = 100 - sourceRank;

  if (sci && text.includes(sci)) score += 90;
  else if (sciTokens.length && sciTokens.every(token => text.includes(token))) score += 65;

  if (common && text.includes(common)) score += 55;
  else if (commonTokens.length && commonTokens.every(token => text.includes(token))) score += 35;

  if (hasAny(text, POSITIVE_PHOTO_TERMS)) score += 18;
  if (/\.(jpe?g|png|webp|tiff?)$/i.test(page.title || "")) score += 8;

  const width = Number(info.width || 0);
  const height = Number(info.height || 0);
  if (width >= 1200 && height >= 800) score += 12;
  else if (width >= 800 && height >= 600) score += 7;
  else if (width && height && (width < 500 || height < 350)) score -= 35;

  if (width && height) {
    const ratio = width / height;
    if (ratio > 2.4 || ratio < 0.42) score -= 22;
    else if (ratio >= 0.65 && ratio <= 1.65) score += 10;
  }

  // Exact name in the file title is a strong sign that the image is species-specific.
  if (sci && title.includes(sci)) score += 35;
  if (common && title.includes(common)) score += 25;

  // Reject unrelated results. A candidate must contain at least a meaningful
  // scientific/common-name match somewhere in its title or metadata.
  const speciesMatch =
    (sci && text.includes(sci)) ||
    (sciTokens.length && sciTokens.every(token => text.includes(token))) ||
    (common && text.includes(common)) ||
    (commonTokens.length && commonTokens.every(token => text.includes(token)));

  if (!speciesMatch) return { reject: true, score: -999 };

  // First-photo preference score. This does not reject otherwise good photos.
  // It simply prefers a clean, bird-focused portrait as the default image.
  let heroScore = score;

  if (hasAny(text, HERO_PHOTO_TERMS)) heroScore += 28;
  if (hasAny(text, HERO_PHOTO_PENALTY_TERMS)) heroScore -= 22;

  if (width && height) {
    const ratio = width / height;

    // Moderate portrait/landscape crops tend to work better for a profile hero
    // than very wide environmental scenes.
    if (ratio >= 0.72 && ratio <= 1.5) heroScore += 12;
    else if (ratio > 1.8) heroScore -= 10;

    // Strong resolution gets a small extra preference for the default image.
    const megapixels = (width * height) / 1_000_000;
    if (megapixels >= 6) heroScore += 8;
    else if (megapixels >= 3) heroScore += 4;
  }

  return { reject: false, score, heroScore };
}

async function searchCommons(searchTerm, limit = 30) {
  if (!searchTerm) return [];
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap \"${searchTerm}\"`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1400",
    format: "json",
    origin: "*"
  });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data.query?.pages || {});
}

async function getCommonsImages(commonName, scientificName) {
  const searches = [];
  if (scientificName) searches.push(scientificName);
  if (commonName && normalize(commonName) !== normalize(scientificName)) searches.push(commonName);
  if (!searches.length) return [];

  const results = await Promise.all(searches.map(term => searchCommons(term).catch(() => [])));
  const seen = new Set();
  const candidates = [];

  results.forEach((pages, sourceRank) => {
    pages.forEach(page => {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata || {};
      const license = normalize(meta.LicenseShortName?.value || meta.UsageTerms?.value || "");
      const url = info?.thumburl || info?.url || "";
      const originalUrl = info?.url || "";
      if (!url || seen.has(url)) return;
      if (!(license.includes("cc") || license.includes("public domain"))) return;

      const scored = scoreCandidate({ page, info, meta, commonName, scientificName, sourceRank: sourceRank * 8 });
      if (scored.reject) return;

      seen.add(url);
      candidates.push({
        url,
        originalUrl,
        artist: stripHtml(meta.Artist?.value || meta.Credit?.value || ""),
        license: stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value || ""),
        licenseUrl: meta.LicenseUrl?.value || "",
        descriptionUrl: info.descriptionurl || "",
        width: Number(info.width || 0),
        height: Number(info.height || 0),
        score: scored.score,
        heroScore: scored.heroScore
      });
    });
  });

  // Keep the same pool of up to 10 qualified photos, but make the first
  // photo the strongest bird-focused "hero" candidate. The remaining photos
  // continue in normal quality order.
  const qualified = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (qualified.length > 1) {
    let heroIndex = 0;
    for (let i = 1; i < qualified.length; i += 1) {
      if ((qualified[i].heroScore || qualified[i].score) >
          (qualified[heroIndex].heroScore || qualified[heroIndex].score)) {
        heroIndex = i;
      }
    }

    if (heroIndex > 0) {
      const [hero] = qualified.splice(heroIndex, 1);
      qualified.unshift(hero);
    }
  }

  return qualified.map(({ score, heroScore, ...image }) => image);
}

async function getCommonsImage(commonName, scientificName) {
  const images = await getCommonsImages(commonName, scientificName);
  return images[0] || null;
}

// Firmware 11.7: first image prefers a clean bird-focused portrait. Maximum remains 10 qualified images.
module.exports = {
  getCommonsImages,
  getCommonsImage
};
