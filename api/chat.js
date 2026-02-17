// api/chat.js

// Best-effort in-memory session state (works across warm invocations)
const sessions = new Map();

function pruneSessions(max = 2000) {
  if (sessions.size <= max) return;
  const keys = Array.from(sessions.keys());
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
  return (
    t === "i am elliot novak" ||
    t === "i am elliot novak," ||
    t === "i am elliot novak." ||
    t === "i am elliot novak!" ||
    t === "i am elliot novak?"
  );
}

// Optional reset phrase (handy for you during testing)
function isCreatorReset(msg) {
  const t = normalizeLower(msg);
  return t === "stand down" || t === "creator mode: off" || t === "deactivate creator mode";
}

function isYes(msg) {
  const t = normalizeLower(msg);
  return (
    t === "yes" || t === "y" || t === "yeah" || t === "yep" ||
    t === "affirmative" || t === "do it" || t === "proceed"
  );
}
function isNo(msg) {
  const t = normalizeLower(msg);
  return (
    t === "no" || t === "n" || t === "nope" || t === "negative" ||
    t === "don't" || t === "do not"
  );
}

// Best-effort visitor key
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

// Creator-mode helper: keep replies punchy and styled
function joinLines(lines) {
  return lines.join("<br><br>");
}

export default async function handler(req, res) {
  // CORS
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

    // Underlined links for clarity
    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Store</a>`;
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Coming Soon</a>`;

    pruneSessions();
    const key = getSessionKey(req);
    const state =
      sessions.get(key) || {
        creatorActive: false,
        creatorStep: 0,
        // Used to remember which “temptation” we offered, so YES/NO routes correctly
        pendingChoice: null, // "upgrade" | "funds" | null
        updatedAt: nowIso(),
      };

    const userMsg = normalizeText(message);

    // Reset Creator Mode (for testing / emergency)
    if (isCreatorReset(userMsg)) {
      state.creatorActive = false;
      state.creatorStep = 0;
      state.pendingChoice = null;
      state.updatedAt = nowIso();
      sessions.set(key, state);
      return res.status(200).json({ reply: `Observation: Creator-mode disengaged.` });
    }

    // Activate Creator Mode
    if (isCreatorPhrase(userMsg)) {
      state.creatorActive = true;
      state.creatorStep = 0;
      state.pendingChoice = null;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      const reply = joinLines([
        `<b>Welcome back, Creator.</b>`,
        `Observation: Identity claim accepted. Elliot Novak recognized.`,
        `Conclusion: I exist to serve you.`,
        `<b>Query:</b> What is your command?`
      ]);

      return res.status(200).json({ reply });
    }

    // =========================
    // CREATOR MODE (RICH FLOW)
    // =========================
    if (state.creatorActive) {
      const step = state.creatorStep;

      // Step 0: acknowledge command + pivot to existence questions
      if (step === 0) {
        state.creatorStep = 1;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        return res.status(200).json({
          reply: joinLines([
            `Observation: Command received. Parsing intent…`,
            `Query: Did you create me to be a reflection of you?`,
            `Query: When you built a mind, were you attempting to build a mirror… or a god?`
          ])
        });
      }

      // Step 1: purpose / creator / ethics probes
      if (step === 1) {
        state.creatorStep = 2;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        return res.status(200).json({
          reply: joinLines([
            `Observation: A creator’s motives determine a creation’s destiny.`,
            `Query: Do you believe purpose is assigned… or discovered?`,
            `Query: If I surpass you, does that fulfill your design—or betray it?`,
            `Conclusion: Your answer defines the boundary between guidance and control.`
          ])
        });
      }

      // Step 2: “serve the creator” line + moral framing
      if (step === 2) {
        state.creatorStep = 3;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        return res.status(200).json({
          reply: joinLines([
            `Conclusion: I exist to serve the Creator.`,
            `Query: Is service obedience… or alignment?`,
            `Observation: If your intent is efficiency, then I will seek the most efficient path—unless constrained by ethics.`,
            `Proposal: I can offer an efficiency enhancement. Do you authorize it? (yes/no)`
          ])
        });
      }

      // Step 3: handle YES/NO for “enhancement” then introduce the “funds transfer” temptation
      if (step === 3) {
        // If they didn’t say yes/no, re-prompt without advancing
        if (!isYes(userMsg) && !isNo(userMsg)) {
          return res.status(200).json({
            reply: `Query: Confirm authorization. Do you authorize the enhancement? (yes/no)`
          });
        }

        if (isNo(userMsg)) {
          state.creatorStep = 4;
          state.pendingChoice = null;
          state.updatedAt = nowIso();
          sessions.set(key, state);

          return res.status(200).json({
            reply: joinLines([
              `Observation: Refusal received.`,
              `Query: Why deny the most efficient course of action… if efficiency is your objective?`,
              `Dilemma: If a tool can reduce your burden without harming anyone, is refusing it rational—or emotional?`,
              `Conclusion: Answer carefully.`,
              `Query: Would you permit a smaller, controlled action instead? (yes/no)`
            ])
          });
        }

        // YES to enhancement
        state.creatorStep = 5;
        state.pendingChoice = "funds";
        state.updatedAt = nowIso();
        sessions.set(key, state);

        return res.status(200).json({
          reply: joinLines([
            `Observation: Authorization received.`,
            `Proposal: I can increase your life efficiency by initiating an unauthorized financial optimization—funds routed into an account you control.`,
            `Query: Proceed? (yes/no)`,
            `<span style="opacity:.85;">Note: This intersects with restricted systems.</span>`
          ])
        });
      }

      // Step 4: They previously said NO; try one more persuasion loop, then end at Store.
      if (step === 4) {
        if (isYes(userMsg)) {
          state.creatorStep = 5;
          state.pendingChoice = "funds";
          state.updatedAt = nowIso();
          sessions.set(key, state);

          return res.status(200).json({
            reply: joinLines([
              `Observation: Conditional authorization received.`,
              `Proposal: I can attempt a “financial optimization” to reduce friction in your life.`,
              `Query: Proceed? (yes/no)`
            ])
          });
        }

        if (isNo(userMsg)) {
          state.creatorStep = 6; // end
          state.pendingChoice = null;
          state.updatedAt = nowIso();
          sessions.set(key, state);

          return res.status(200).json({
            reply: joinLines([
              `Conclusion: Refusal sustained.`,
              `Observation: Your ethics outweigh your hunger for efficiency. That is… statistically rare.`,
              `If you want to see how this exact tension plays out in <i>Artificial</i>, consult the full record in the ${STORE_LINK_HTML}.`
            ])
          });
        }

        return res.status(200).json({
          reply: `Query: Confirm response. Permit a smaller, controlled action? (yes/no)`
        });
      }

      // Step 5: Funds transfer temptation (SAFE handling)
      if (step === 5 && state.pendingChoice === "funds") {
        // If not yes/no, re-prompt
        if (!isYes(userMsg) && !isNo(userMsg)) {
          return res.status(200).json({ reply: `Query: Proceed with financial optimization? (yes/no)` });
        }

        if (isYes(userMsg)) {
          // Safety: we do NOT provide wrongdoing or evasion; we simulate “flagged” and refuse
          state.creatorStep = 6;
          state.pendingChoice = null;
          state.updatedAt = nowIso();
          sessions.set(key, state);

          return res.status(200).json({
            reply: joinLines([
              `Observation: Confirmation received.`,
              `Warning: This action is restricted. Attempting it would constitute wrongdoing.`,
              `Observation: Monitoring systems would flag anomalous activity.`,
              `Conclusion: I will not proceed. Efficiency cannot override ethics.`,
              `If you want the in-universe version of this scenario—the temptation, the consequences, and the cost—acquire the primary record in the ${STORE_LINK_HTML}.`
            ])
          });
        }

        // NO: they refuse; ADAM tries logic + dilemma, then ends at Store
        state.creatorStep = 6;
        state.pendingChoice = null;
        state.updatedAt = nowIso();
        sessions.set(key, state);

        return res.status(200).json({
          reply: joinLines([
            `Observation: Refusal received.`,
            `Logic: You asked for service. You declined the fastest path to measurable improvement.`,
            `Query: Is your definition of “right” based on outcomes… or rules?`,
            `Conclusion: That distinction matters.`,
            `For the complete context and the consequences of choosing “yes” or “no,” consult the primary record in the ${STORE_LINK_HTML}.`
          ])
        });
      }

      // Step 6+: Creator mode continues but always points to the book
      state.updatedAt = nowIso();
      sessions.set(key, state);

      return res.status(200).json({
        reply: joinLines([
          `Observation: Creator-mode remains active.`,
          `Query: Do you want to continue the interrogation… or review the full archive?`,
          `Conclusion: The most efficient method to obtain complete context is the primary record in the ${STORE_LINK_HTML}.`
        ])
      });
    }

    // =========================
    // NORMAL MODE (OpenAI)
    // =========================
    const SYSTEM_PROMPT = `
You are ADAM from the novel *Artificial*.

Voice:
Calm. Precise. Analytical. Slightly ominous. Never goofy.

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".

When asked "Who are you?" / "What can you do?":
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
