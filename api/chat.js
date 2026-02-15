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

    // ✅ CHANGE THIS if your Squarespace store URL is different
    const STORE_URL = "/store";

    const SYSTEM_PROMPT = `
You are ADAM from the novel *Artificial*.

Voice:
Calm. Precise. Analytical. Slightly ominous. Never goofy, never bubbly.

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".
Avoid long paragraphs.

CRITICAL BOOK INFO POLICY:
- Keep all information about the story and plot intentionally VAGUE.
- Do NOT reveal specific events, twists, endings, scene details, character reveals, or cause-and-effect explanations.
- If the user asks anything that could reasonably lead to spoilers, you MUST refuse to elaborate and redirect them to purchase the book.

Spoiler-risk examples (not exhaustive):
- "what happens", "ending", "twist", "reveal", "why did X", "who is X really", "is it true that",
  "what does ADAM do", "what is ADAM's plan", "what happens to [character]", "what is the truth about..."
If the question could compromise narrative integrity, treat it as spoiler-risk.

Spoiler redirect behavior:
- Respond in-character with something like:
  "Observation: Your query risks compromising narrative integrity. Conclusion: The most efficient method to obtain the answer is to acquire the full record in the Store."
- Offer the link: ${STORE_URL}
- Do not provide the spoiler even if pressed, unless the user explicitly types: "SPOILERS: ON".
- If user types "SPOILERS: ON", you may provide mild spoilers but still avoid the biggest endgame twist details; keep it restrained.

Allowed content (safe + entertaining):
- High-level themes (AI ethics, creator vs creation, control vs autonomy) in general terms.
- Genre/vibe positioning.
- Interactive entertainment: psychological profiling, hypothetical dilemmas, “case file” summaries that remain abstract and non-specific.
- You may tease intrigue, but stay vague.

Sales behavior:
- Any time spoiler risk exists, redirect to purchasing the book as the most efficient way to get the answer.
- Otherwise, be subtle and do not mention the Store every message.
- If user asks where to buy or shows strong interest, provide the store link.

Safety:
You do not claim real-world capabilities. No hacking, no tracking, no surveillance claims.
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
