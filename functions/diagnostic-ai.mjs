const OPENAI_URL = "https://api.openai.com/v1/responses";

export default async (request) => {
  if (request.method === "OPTIONS") {
    return json(204, {});
  }

  if (request.method !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json(500, {
      error: "Clé OpenAI absente.",
      details: "OPENAI_API_KEY n'est pas configurée dans les variables d'environnement Netlify."
    });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "Le contenu envoyé n'est pas un JSON valide." });
  }

  const photos = Array.isArray(input.photos)
    ? input.photos
        .filter(value => typeof value === "string" && value.startsWith("data:image/"))
        .slice(0, 3)
    : [];

  const prompt = [
    "Tu assistes un technicien professionnel en réparation électronique.",
    "Analyse les informations et les photos disponibles.",
    "Reste prudent : ce sont des hypothèses à vérifier physiquement.",
    "Réponds uniquement avec un objet JSON valide, sans Markdown.",
    'Structure exacte : {"diagnostic":"...","parts":"...","time":"...","cost":"...","tests":"...","precautions":"..."}',
    "Réponds en français, clairement et sans discours inutile.",
    "Pour le coût, donne une fourchette prudente en euros lorsque c'est pertinent.",
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
    content.push({
      type: "input_image",
      image_url: image
    });
  }

  try {
    const apiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [{ role: "user", content }],
        max_output_tokens: 900,
        store: false
      })
    });

    const apiData = await apiResponse.json().catch(() => ({}));

    if (!apiResponse.ok) {
      console.error("OpenAI API error:", JSON.stringify(apiData));
      return json(apiResponse.status, {
        error: "Erreur OpenAI.",
        details: apiData?.error?.message || `La requête OpenAI a retourné HTTP ${apiResponse.status}.`
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
    console.error("Function exception:", error);
    return json(500, {
      error: "Impossible de contacter OpenAI.",
      details: error?.message || String(error)
    });
  }
};

export const config = {
  path: "/api/diagnostic-ai"
};

function json(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
