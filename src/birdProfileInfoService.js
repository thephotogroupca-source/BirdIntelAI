const SECTION_CONFIG = {
  overview: {
    label: "Overview",
    instruction: "Give a concise overview of this bird: what it is, what makes it distinctive, and where it generally occurs. About 60 to 90 words."
  },
  classification: {
    label: "Classification",
    instruction: "Give the practical classification for this bird: its broad bird group and family. Do not provide a long taxonomy. About 1 to 3 short sentences."
  },
  identification: {
    label: "Identification",
    instruction: "Describe useful field identification: size, main colors, distinctive markings, bill or body shape, and male/female or juvenile differences only when reliably known. About 60 to 100 words."
  },
  rangeHabitat: {
    label: "Range & Habitat",
    instruction: "Describe the geographic range and preferred habitat of this bird. Mention countries or regions only when reliable. About 60 to 100 words."
  },
  migrationStatus: {
    label: "Migration Status",
    instruction: "State whether this bird is resident, migratory, partially migratory, nomadic, or has another well-supported movement pattern. Keep it concise."
  },
  breeding: {
    label: "Breeding",
    instruction: "Summarize reliable breeding information such as breeding season, nest type/location, clutch information, and notable breeding behavior. About 60 to 100 words."
  },
  dietFeeding: {
    label: "Diet & Feeding",
    instruction: "Summarize what this bird eats and how it feeds. About 50 to 90 words."
  },
  behavior: {
    label: "Behavior",
    instruction: "Summarize characteristic behavior such as territorial, social, flight, calling, or feeding behavior. About 50 to 90 words."
  }
};

function cleanJsonText(value = "") {
  return String(value).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeStatus(value = "") {
  const text = String(value).trim().toLowerCase();
  const map = {
    "least concern": "Least Concern", "lc": "Least Concern",
    "near threatened": "Near Threatened", "nt": "Near Threatened",
    "vulnerable": "Vulnerable", "vu": "Vulnerable",
    "endangered": "Endangered", "en": "Endangered",
    "critically endangered": "Critically Endangered", "cr": "Critically Endangered",
    "extinct in the wild": "Extinct in the Wild", "ew": "Extinct in the Wild",
    "extinct": "Extinct", "ex": "Extinct",
    "data deficient": "Data Deficient", "dd": "Data Deficient",
    "not evaluated": "Not Evaluated", "ne": "Not Evaluated"
  };
  if (map[text]) return map[text];
  if (text.includes("critically endangered")) return "Critically Endangered";
  if (text.includes("extinct in the wild")) return "Extinct in the Wild";
  if (text.includes("near threatened")) return "Near Threatened";
  if (text.includes("least concern")) return "Least Concern";
  if (text.includes("data deficient")) return "Data Deficient";
  if (text.includes("not evaluated")) return "Not Evaluated";
  if (text.includes("no separate current iucn")) return "Not Evaluated";
  if (text === "not provided") return "";
  if (text.includes("endangered")) return "Endangered";
  if (text.includes("vulnerable")) return "Vulnerable";
  if (text === "extinct" || text.includes("globally extinct")) return "Extinct";
  return String(value).trim();
}

function extractOutputText(data = {}) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function askOpenAI(body) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Bird Profile information.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BIRD_PROFILE_AI_TIMEOUT_MS || 45000));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error?.message || "").trim();
      throw new Error(detail ? `OpenAI returned ${response.status}: ${detail}` : `OpenAI returned ${response.status}.`);
    }
    const text = extractOutputText(data);
    if (!text) throw new Error("OpenAI returned an empty Bird Profile response.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function birdLabel({ commonName, scientificName }) {
  const common = String(commonName || "").trim();
  const scientific = String(scientificName || "").trim();
  return scientific ? `${common || scientific} (${scientific})` : common;
}


function cleanSection(value = "") {
  const text = String(value || "").trim();
  if (!text || /^NOT_AVAILABLE\.?$/i.test(text)) return "";
  return text;
}

function normalizeProfileBundle(raw = {}) {
  const sections = raw.sections && typeof raw.sections === "object" ? raw.sections : raw;

  const profile = {
    overview: cleanSection(sections.overview),
    classification: cleanSection(sections.classification),
    identification: cleanSection(sections.identification),
    rangeHabitat: cleanSection(sections.rangeHabitat),
    migrationStatus: cleanSection(sections.migrationStatus),
    breeding: cleanSection(sections.breeding),
    dietFeeding: cleanSection(sections.dietFeeding),
    behavior: cleanSection(sections.behavior),
    conservation: {}
  };

  const c = raw.conservation && typeof raw.conservation === "object"
    ? raw.conservation
    : {};

  const status = normalizeStatus(c.status || "");
  const populationTrend = String(c.populationTrend || "").trim();
  const concerningStatus = [
    "Near Threatened",
    "Vulnerable",
    "Endangered",
    "Critically Endangered",
    "Extinct in the Wild"
  ].includes(status);
  const declining = /declin/i.test(populationTrend);

  if (status) profile.conservation.status = status;
  if (populationTrend) profile.conservation.populationTrend = populationTrend;

  if (concerningStatus || declining) {
    const threats = String(c.threats || "").trim();
    const howToHelp = String(c.howToHelp || "").trim();
    if (threats) profile.conservation.threats = threats;
    if (howToHelp) profile.conservation.howToHelp = howToHelp;
  }

  return profile;
}

function buildBirdProfileRequest(params, options = {}) {
  const bird = birdLabel(params);
  const contextCountry = String(params.contextCountry || "").trim();

  const instructions = [
    "You prepare one complete structured Bird Profile for Wildlife Knowledge Hub.",
    "The selected subject is always a bird species and is always in scope.",
    "Use plain, factual language for a general wildlife audience.",
    "Use reliable wildlife knowledge and do not invent uncertain details.",
    "Use openly accessible web information when needed, especially for the current global conservation assessment.",
    "Do not depend on subscription-only sources.",
    "Return ONLY valid JSON, with no markdown fences, citations, URLs, comments, headings outside the JSON, or additional text.",
    "Use this exact top-level structure:",
    "{\"sections\":{\"overview\":\"\",\"classification\":\"\",\"identification\":\"\",\"rangeHabitat\":\"\",\"migrationStatus\":\"\",\"breeding\":\"\",\"dietFeeding\":\"\",\"behavior\":\"\"},\"conservation\":{\"status\":\"\",\"populationTrend\":\"\",\"threats\":\"\",\"howToHelp\":\"\"}}.",
    "For any section that cannot be supported reliably, return an empty string.",
    "Overview should be about 60 to 90 words.",
    "Classification should be 1 to 3 short sentences and avoid long taxonomy.",
    "Identification, rangeHabitat, and breeding should each be about 60 to 100 words when available.",
    "DietFeeding and behavior should each be about 50 to 90 words when available.",
    "MigrationStatus should be concise.",
    "For conservation, prefer the current recognized global assessment such as IUCN/BirdLife when available.",
    "For a stable Least Concern species, keep threats and howToHelp empty.",
    "Only include threats and howToHelp for a meaningful conservation concern or reliably declining population."
  ].join(" ");

  const input = [
    `Selected bird: ${bird}.`,
    contextCountry
      ? `Regional context: ${contextCountry}. In Range & Habitat and Migration Status, explicitly explain how this species occurs in ${contextCountry} when reliable information is available.`
      : "",
    "Prepare all Bird Profile sections and conservation information in the single JSON response."
  ].filter(Boolean).join(" ");

  const body = {
    model: String(options.model || process.env.BIRD_PROFILE_OPENAI_MODEL || "gpt-5.6").trim(),
    reasoning: { effort: String(options.reasoningEffort || "low") },
    input,
    instructions,
    max_output_tokens: Number(options.maxOutputTokens || 3200),
    text: {
      format: {
        type: "json_schema",
        name: "bird_profile",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sections: {
              type: "object",
              properties: {
                overview: { type: "string" },
                classification: { type: "string" },
                identification: { type: "string" },
                rangeHabitat: { type: "string" },
                migrationStatus: { type: "string" },
                breeding: { type: "string" },
                dietFeeding: { type: "string" },
                behavior: { type: "string" }
              },
              required: [
                "overview",
                "classification",
                "identification",
                "rangeHabitat",
                "migrationStatus",
                "breeding",
                "dietFeeding",
                "behavior"
              ],
              additionalProperties: false
            },
            conservation: {
              type: "object",
              properties: {
                status: { type: "string" },
                populationTrend: { type: "string" },
                threats: { type: "string" },
                howToHelp: { type: "string" }
              },
              required: ["status", "populationTrend", "threats", "howToHelp"],
              additionalProperties: false
            }
          },
          required: ["sections", "conservation"],
          additionalProperties: false
        }
      }
    },
    store: false
  };

  if (options.useWebSearch !== false) {
    body.tools = [{ type: "web_search" }];
    body.tool_choice = "auto";
  }

  return body;
}

function parseBirdProfileText(answer) {
  let raw;
  try {
    raw = JSON.parse(cleanJsonText(answer));
  } catch (_) {
    throw new Error("OpenAI returned invalid structured Bird Profile information.");
  }

  return normalizeProfileBundle(raw);
}

async function getBirdProfileBundle(params) {
  const answer = await askOpenAI(buildBirdProfileRequest(params));

  return parseBirdProfileText(answer);
}

// Compatibility helpers. They do not create their own OpenAI requests when
// the server uses the unified cached bundle endpoint.
async function getBirdProfileSection(params, section) {
  if (!SECTION_CONFIG[section]) throw new Error("Unknown Bird Profile section.");
  const profile = await getBirdProfileBundle(params);
  return profile[section] || "";
}

async function getBirdConservation(params) {
  const profile = await getBirdProfileBundle(params);
  return profile.conservation || {};
}

module.exports = {
  SECTION_CONFIG,
  buildBirdProfileRequest,
  extractOutputText,
  normalizeProfileBundle,
  parseBirdProfileText,
  getBirdProfileBundle,
  getBirdProfileSection,
  getBirdConservation
};
