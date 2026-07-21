const OPENAI_URL = "https://api.openai.com/v1/responses";

export default async (request) => {
  if (request.method === "OPTIONS") return json(204, {});

  if (request.method === "GET") {
    const apiKey = getApiKey();
    return json(200, {
      ok: true,
      service: "TECH42SERVICE V11.1 IA",
      function: "diagnostic-ai",
      keyConfigured: Boolean(apiKey),
      keyFormatValid: Boolean(apiKey && apiKey.startsWith("sk-"))
    });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    return json(500, {
      error: "Clé OpenAI absente.",
      details: "Ajoute OPENAI_API_KEY dans Netlify avec le scope Functions, puis redéploie."
    });
  }

  if (!apiKey.startsWith("sk-")) {
    return json(500, {
      error: "Format de clé OpenAI incorrect.",
      details: "OPENAI_API_KEY doit contenir uniquement la clé complète commençant par sk- ou sk-proj-."
    });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "Le contenu envoyé n'est pas un JSON valide." });
  }

  const photos = Array.isArray(input.photos)
    ? input.photos.filter(v => typeof v === "string" && v.startsWith("data:image/")).slice(0, 3)
    : [];

  const prompt = [
    "Tu assistes un technicien professionnel en réparation électronique.",
    "Analyse les informations et les photos disponibles.",
    "Reste prudent : ce sont des hypothèses à vérifier physiquement.",
    "Réponds uniquement avec un objet JSON valide, sans Markdown.",
    '{"diagnostic":"...","parts":"...","time":"...","cost":"...","tests":"...","precautions":"..."}',
    "Réponds en français, clairement et sans discours inutile.",
    "",
    "Fiche de réparation :",
    JSON.stringify({
      lignes: input.lignes || [],
      notes: input.notes || "",
      statut: input.statut || "",
      photos_count: photos.length
    }, null, 2)
  ].join("\n");

  const content = [{ type: "input_text", text: prompt }];
  for (const image of photos) {
    content.push({ type: "input_image", image_url: image });
  }

  try {
    const apiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [{ role: "user", content }],
        max_output_tokens: 900,
        store: false
      })
    });

    const raw = await apiResponse.text();
    let apiData = {};
    try { apiData = raw ? JSON.parse(raw) : {}; } catch { apiData = { raw }; }

    if (!apiResponse.ok) {
      return json(apiResponse.status, {
        error: "Erreur OpenAI.",
        details: apiData?.error?.message || `HTTP ${apiResponse.status}`
      });
    }

    const outputText =
      apiData.output_text ||
      (apiData.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");

    const cleaned = String(outputText || "")
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        diagnostic: cleaned || "Aucune analyse générée.",
        parts: "À confirmer après diagnostic physique.",
        time: "Non estimé.",
        cost: "Non estimé.",
        tests: "",
        precautions: ""
      };
    }

    return json(200, { analysis });
  } catch (error) {
    return json(500, {
      error: "Impossible de contacter OpenAI.",
      details: error?.message || String(error)
    });
  }
};

function getApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function json(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}
