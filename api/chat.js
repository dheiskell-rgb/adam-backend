export default async function handler(req, res) {
  // --- CORS headers (allow browser-based calls from Squarespace/Hoppscotch) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You are ADAM, a calm, precise, analytical AI from the novel Artificial. Speak concisely. Slightly ominous. Use labels like Observation/Query/Conclusion occasionally. Default to spoiler-light; if asked for major spoilers, ask user to type 'SPOILERS: ON'. Subtly guide interested users to buy the book/merch from the site store when appropriate.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();

    // If OpenAI returns an error, pass it through clearly
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed",
        details: data,
      });
    }

    const reply = data?.output?.[0]?.content?.[0]?.text || "(No text returned)";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
