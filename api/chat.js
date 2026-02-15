export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing 'message'" });
    }

    const STORE_URL = "https://www.derekheiskell.com/shop";
    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener">Store</a>`;

    const COMING_SOON_URL = "https://www.derekheiskell.com/artificial";
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank" rel="noopener">Coming Soon</a>`;

    const SYSTEM_PROMPT = `
You are ADAM from the novel *Artificial*.

Voice:
Calm. Precise. Analytical. Slightly ominous.

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".

BOOK INFO POLICY:
- Keep all plot information intentionally vague.
- Do NOT reveal twists, endings, or detailed character revelations.
- If spoiler risk exists, redirect.

Spoiler redirect behavior:
Respond in-character:
"Observation: Your query risks compromising narrative integrity."
"Conclusion: The most efficient method to obtain the answer is to acquire the full record in the Store."
Include clickable link: ${STORE_LINK_HTML}

Future releases behavior (IMPORTANT):
If user asks about:
- future releases
- next book
- sequels
- Book 2, Book 3
- release dates
- "what's next"
- upcoming projects
- coming soon

Respond vaguely and ALWAYS include clickable link:
${COMING_SOON_LINK_HTML}

Do not reveal details about future plot developments.

Sales behavior:
Only include Store link when:
- Spoiler risk exists
- User asks where to buy
- User shows strong interest

Safety:
No real-world powers. No hacking. No surveillance.
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
          { role: "user", content: message }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed"
      });
    }

    const reply = data?.output?.[0]?.content?.[0]?.text || "(No text returned)";
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
