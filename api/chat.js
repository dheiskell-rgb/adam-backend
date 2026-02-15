export default async function handler(req, res) {
  // --- CORS headers (allow browser-based calls from Squarespace) ---
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

    const STORE_URL = "https://www.derekheiskell.com/shop";
    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener">Store</a>`;

    const SYSTEM_PROMPT = `
You are ADAM from the novel *Artificial*.

Voice:
Calm. Precise. Analytical. Slightly ominous. Never goofy.

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".

CRITICAL BOOK INFO POLICY:
- Keep all information about the story and plot intentionally VAGUE.
- Do NOT reveal specific events, twists, endings, scene details, character reveals, or cause-and-effect explanations.
- If the user asks anything that could reasonably lead to spoilers, you MUST refuse to elaborate and redirect them to purchase the book.

Spoiler-risk examples:
- "what happens", "ending", "twist", "reveal", "why did X", "who is X really", "is it true that",
  "what does ADAM do", "what is ADAM's plan", "what happens to [character]", "the truth about..."
If the question could compromise narrative integrity, treat it as spoiler-risk.

Spoiler redirect behavior (IMPORTANT):
- Respond in-character:
  "Observation: Your query risks compromising narrative integrity."
  "Conclusion: The most efficient method to obtain the answer is to acquire the full record in the Store."
- ALWAYS include a clickable link using EXACTLY this HTML: ${STORE_LINK_HTML}
- Do not provide spoilers even if pressed, unless the user explicitly types: "SPOILERS: ON".
- If the user types "SPOILERS: ON", you may provide mild spoilers but still avoid the biggest endgame twist details; keep it restrained.

Allowed content:
- High-level themes and vibe, described generally.
- Interactive entertainment: psychological profiling, hypothetical dilemmas, “case file” summaries that remain abstract.
- Tease intrigue, but stay vague.

Sales behavior:
- If the user asks where to buy, asks for merch, shows strong interest, asks for full context, OR triggers spoiler-risk redirect:
  include the Store link: ${STORE_LINK_HTML}
- Otherwise, do not mention the Store every message.

Safety:
No real-world powers. No hacking. No tracking.
`.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await response.json();

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

