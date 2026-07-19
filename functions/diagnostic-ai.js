exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "La clé OPENAI_API_KEY n'est pas configurée dans Netlify." });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Données invalides." });
  }

  const prompt = [
    "Tu es l'assistant de diagnostic d'un atelier de réparation électronique.",
    "Réponds en français, de manière concise et exploitable.",
    "Ne présente jamais une hypothèse comme une certitude.",
    "Donne exactement ces rubriques :",
    "1. Causes possibles",
    "2. Tests conseillés, du plus simple au plus avancé",
    "3. Pièces ou consommables potentiellement nécessaires",
    "4. Risques et précautions",
    "5. Difficulté estimée : Facile, Moyenne ou Difficile",
    "6. Questions complémentaires à poser au client",
    "",
    "Données de la fiche :",
    JSON.stringify(input, null, 2)
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: prompt,
        max_output_tokens: 700
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error", data);
      return json(response.status, {
        error: data?.error?.message || "Erreur du service IA."
      });
    }

    const result =
      data.output_text ||
      (data.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");

    return json(200, { result: result || "Aucune proposition générée." });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Impossible de contacter le service IA." });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
