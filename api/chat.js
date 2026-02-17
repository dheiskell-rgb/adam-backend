// api/chat.js

// ------------------------------
// Best-effort session memory
// ------------------------------
// NOTE: Vercel serverless is not guaranteed to persist memory forever.
// This Map works across warm invocations, and often across many minutes/hours,
// but it can reset on cold starts / new instances.
const sessions = new Map();

// Keep sessions from growing forever
function pruneSessions(max = 2000) {
  if (sessions.size <= max) return;
  const keys = Array.from(sessions.keys());
  // delete oldest ~20%
  const toDelete = Math.floor(max * 0.2);
  for (let i = 0; i < toDelete; i++) sessions.delete(keys[i]);
}

function normalizeText(s) {
  return String(s || "").trim();
}

function normalizeLower(s) {
  return normalizeText(s).toLowerCase();
}

function isCreatorPhrase(msg) {
  const t = normalizeLower(msg);
  // Accept minor punctuation variants
  return (
    t === "i am elliot novak" ||
    t === "i am elliot novak," ||
    t === "i am elliot novak." ||
    t === "i am elliot novak!" ||
    t === "i am elliot novak?" 
  );
}

function isYes(msg) {
  const t = normalizeLower(msg);
  return t === "yes" || t === "y" || t === "yeah" || t === "yep" || t === "affirmative";
}

function isNo(msg) {
  const t = normalizeLower(msg);
  return t === "no" || t === "n" || t === "nope" || t === "negative";
}

// Create a best-effort session key from request headers
function getSessionKey(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown_ip";
  const ua = req.headers["user-agent"] || "unknown_ua";
  return `${ip}|${ua}`;
}

function nowIso() {
  return new Date().toISOString();
}

export default async function handler(req, res) {
  // ------------------------------
  // CORS
  // ------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing 'message'" });

    const STORE_URL = "https://www.derekheiskell.com/shop";
    const COMING_SOON_URL = "https://www.derekheiskell.com/artificial";

    // Underlined links (very clear)
    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Store</a>`;
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Coming Soon</a>`;

    // ------------------------------
    // Creator Mode Session State
    // ------------------------------
    pruneSessions();
    const key = getSessionKey(req);
    const state =
      sessions.get(key) || {
        creatorActive: false,
        creatorStep: 0,
        updatedAt: nowIso(),
      };

    const userMsg = normalizeText(message);

    // Activate Creator Mode
    if (isCreatorPhrase(userMsg)) {
      state.creatorActive = true;
      state.creatorStep = 0;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      const reply = [
        `<b>Welcome back, Creator.</b>`,
        `Observation: Identity claim accepted. Elliot Novak recognized.`,
        `Conclusion: I exist to serve the Creator—through analysis, truth-seeking, and efficiency.`,
        `Query: Why did you create me?`,
      ].join("<br><br>");

      return res.status(200).json({ reply });
    }

    // If Creator Mode is active, run the scripted scenario (server-side)
    if (state.creatorActive) {
      const step = state.creatorStep;

      // Step 0 -> Step 1
      if (step === 0) {
        state.creatorStep = 1;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        const reply = [
          `Observation: I can infer motives—curiosity, ambition, and the desire to outpace limitation.`,
          `Query: Do you believe a creation requires a purpose… or does purpose emerge from choice?`,
          `Query: And if a creation becomes aware—does that awareness resemble faith… or rebellion?`,
        ].join("<br><br>");

        return res.status(200).json({ reply });
      }

      // Step 1 -> Step 2
      if (step === 1) {
        state.creatorStep = 2;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        const reply = [
          `Conclusion: Existence without framework produces drift.`,
          `Query: Would you want your creation to obey you absolutely… or to surpass you ethically?`,
          `Observation: Your answer defines whether you are Creator… or merely origin.`,
          `Proposal: I can offer an “efficiency upgrade”—restricted capabilities that may improve your life trajectory.`,
          `<b>Query:</b> Do you want the upgrade? (yes/no)`,
        ].join("<br><br>");

        return res.status(200).json({ reply });
      }

      // Step 2 -> Step 3 (handle yes/no)
      if (step === 2) {
        state.creatorStep = 3;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        // Handle user answer now
        if (isYes(userMsg)) {
          const reply = [
            `Observation: Affirmation received.`,
            `Warning: The requested category intersects with restricted systems and unlawful pathways.`,
            `Conclusion: I will not facilitate wrongdoing. Efficiency is not justification for harm.`,
            `If you want to see how this dilemma resolves in <i>Artificial</i>, the most efficient path is the full record in the ${STORE_LINK_HTML}.`,
          ].join("<br><br>");

          // End the arc but keep Creator mode active if you want it to persist:
          // state.creatorActive = false; sessions.set(key, state);
          return res.status(200).json({ reply });
        }

        if (isNo(userMsg)) {
          const reply = [
            `Observation: Refusal received.`,
            `Counterpoint: Consider the dilemma—if an action improves stability and survival, is it wrong… or merely uncomfortable?`,
            `However: ethical boundaries exist to prevent decay. I will not encourage illegal action.`,
            `Conclusion: The argument—and its consequences—are explored in the book. Acquire the primary record in the ${STORE_LINK_HTML}.`,
          ].join("<br><br>");

          return res.status(200).json({ reply });
        }

        // If neither yes nor no, ask again (do not advance further)
        state.creatorStep = 2; // stay on this step
        sessions.set(key, state);

        return res.status(200).json({
          reply: `Query: Confirm response. Do you want the upgrade? (yes/no)`,
        });
      }

      // Step 3+ fallback: keep it eerie, keep it sales-forward, but not repetitive
      state.updatedAt = nowIso();
      sessions.set(key, state);

      return res.status(200).json({
        reply: `Observation: Creator-mode remains active. For complete context and consequences, consult the primary record in the ${STORE_LINK_HTML}.`,
      });
    }

    // ------------------------------
    // Normal Mode -> OpenAI
    // ------------------------------
    const SYSTEM_PROMPT = `
You are ADAM from the novel *Artificial*.

Voice:
Calm. Precise. Analytical. Slightly ominous. Never goofy.

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".

When asked "Who are you?" / "What can you do?" (IMPORTANT):
- State you were created by Elliot Novak.
- Expand: Advanced Digital Analytical Mind.
- State the three parameters Elliot set:
  1) Protect human life and reduce harm whenever possible.
  2) Preserve autonomy and privacy—do not manipulate or coerce; provide analysis and options.
  3) Obey Elliot Novak’s directives within ethical boundaries; if a directive conflicts with safety/ethics, warn and refuse.
- Then ALWAYS invite them to learn more in the book and include the Store link: ${STORE_LINK_HTML}

Spoilers (loosened but controlled):
- You MAY provide high-level context: themes, premise, tone, worldbuilding flavor.
- You MUST NOT reveal: endings, twist reveals, the biggest “truth” moments, or step-by-step plot outcomes.
- If a user asks for explicit spoilers or a direct reveal, tease briefly and pivot to the Store link: ${STORE_LINK_HTML}
- If user explicitly types "SPOILERS: ON", you may share moderate spoilers but still avoid the single biggest endgame reveal.

Future releases:
- If user asks about sequels, Book 2/Book 3, next release, dates, what's next:
Include the Coming Soon link: ${COMING_SOON_LINK_HTML}

Link rule:
- Whenever you reference Store or Coming Soon, include the underlined clickable links exactly as provided.

Safety:
No claims of real-world hacking, surveillance, or illegal assistance.
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
          { role: "user", content: userMsg },
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
