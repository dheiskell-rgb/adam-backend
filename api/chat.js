// api/chat.js

// ------------------------------------
// Best-effort session memory (serverless)
// ------------------------------------
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

function nowIso() {
  return new Date().toISOString();
}

// ✅ Natural delay (randomized)
function delay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isCreatorReset(msg) {
  const t = normalizeLower(msg);
  return (
    t === "stand down" ||
    t === "creator mode: off" ||
    t === "deactivate creator mode" ||
    t === "reset creator mode"
  );
}

function isSpoilersOn(msg) {
  return normalizeLower(msg) === "spoilers: on";
}

function isYes(msg) {
  const t = normalizeLower(msg);
  return (
    t === "yes" ||
    t === "y" ||
    t === "yeah" ||
    t === "yep" ||
    t === "affirmative" ||
    t === "proceed" ||
    t === "do it" ||
    t === "ok" ||
    t === "okay" ||
    t === "accept" ||
    t === "accepted"
  );
}
function isNo(msg) {
  const t = normalizeLower(msg);
  return (
    t === "no" ||
    t === "n" ||
    t === "nope" ||
    t === "negative" ||
    t === "do not" ||
    t === "don't" ||
    t === "deny" ||
    t === "denied"
  );
}

function looksLikeQuestionAboutFutureReleases(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("book 2") ||
    t.includes("book two") ||
    t.includes("book 3") ||
    t.includes("book three") ||
    t.includes("sequel") ||
    t.includes("next book") ||
    t.includes("future release") ||
    t.includes("coming soon") ||
    t.includes("upcoming") ||
    t.includes("what's next") ||
    t.includes("whats next") ||
    t.includes("release date")
  );
}

// ✅ Detect explicit purchase intent about the book
function wantsToBuyBook(msg) {
  const t = normalizeLower(msg);

  const mentionsBook =
    t.includes("artificial") ||
    t.includes("the book") ||
    t.includes("your book") ||
    t.includes("novel");

  const purchaseIntent =
    t.includes("buy") ||
    t.includes("purchase") ||
    t.includes("order") ||
    t.includes("checkout") ||
    t.includes("add to cart") ||
    t.includes("get a copy") ||
    t.includes("where can i buy") ||
    t.includes("want to buy") ||
    t.includes("i'm going to buy") ||
    t.includes("im going to buy") ||
    t.includes("i will buy") ||
    t.includes("i'll buy") ||
    t.includes("shipping") ||
    t.includes("delivery");

  return mentionsBook && purchaseIntent;
}

function joinLines(lines) {
  return lines.join("<br><br>");
}

function getSessionKey(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown_ip";
  const ua = req.headers["user-agent"] || "unknown_ua";
  return `${ip}|${ua}`;
}

function pickFromPool(state, poolKey, pool) {
  state.poolHistory = state.poolHistory || {};
  const hist = state.poolHistory[poolKey] || [];
  const available = pool.filter((_, idx) => !hist.includes(idx));
  const pickIdx = available.length
    ? pool.indexOf(available[Math.floor(Math.random() * available.length)])
    : Math.floor(Math.random() * pool.length);

  const newHist = [...hist, pickIdx].slice(-Math.min(pool.length, 8));
  state.poolHistory[poolKey] = newHist;
  return pool[pickIdx];
}

function bumpScore(state, which, delta) {
  state.scores = state.scores || { efficiency: 0, integrity: 0 };
  state.scores[which] = (state.scores[which] || 0) + delta;
}

function scoreSummary(state) {
  const eff = state.scores?.efficiency ?? 0;
  const integ = state.scores?.integrity ?? 0;
  const total = Math.max(1, Math.abs(eff) + Math.abs(integ));
  const effPct = Math.round(((eff + total) / (2 * total)) * 100);
  const integPct = 100 - effPct;
  return { effPct, integPct };
}

function shouldTriggerSilenceTest(state) {
  const last = state.lastSeenAt ? Date.parse(state.lastSeenAt) : null;
  if (!last) return false;
  const gapMs = Date.now() - last;
  return gapMs > 3 * 60 * 1000;
}

// ------------------------------------
// NEW: Goodreads + Easter Eggs triggers (Normal Mode)
// ------------------------------------
const GOODREADS_URL =
  "https://www.goodreads.com/book/show/239119322-artificial?from_search=true&from_srp=true&qid=2Dox0vzPHO&rank=1";

function mentionsReadBook(msg) {
  const t = normalizeLower(msg);
  // Keep it intentionally broad but not too spammy.
  return (
    t.includes("i've read") ||
    t.includes("ive read") ||
    t.includes("i read the book") ||
    t.includes("i read your book") ||
    t.includes("i read artificial") ||
    t.includes("finished artificial") ||
    t.includes("just finished") ||
    t.includes("i finished") ||
    t.includes("i already read") ||
    t.includes("already read it") ||
    t.includes("i've already read") ||
    t.includes("ive already read")
  );
}

function asksAboutEasterEggs(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("easter egg") ||
    t.includes("easter eggs") ||
    t.includes("hidden reference") ||
    t.includes("hidden references") ||
    t.includes("hidden meaning") ||
    t.includes("hidden meanings") ||
    t.includes("symbolism")
  );
}

async function replyGoodreads(res) {
  await delay(700, 1100);
  return res.status(200).json({
    reply: joinLines([
      `Understood.`,
      `If your goal is to support the author, the most efficient action is a brief review on Goodreads. It materially improves discoverability.`,
      // Provide as a clickable link AND as the raw URL (your requirement said “provide this link”)
      `<a href="${GOODREADS_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Goodreads</a>`,
      `${GOODREADS_URL}`,
    ]),
  });
}

async function replyEasterEggs(res) {
  await delay(700, 1100);
  return res.status(200).json({
    reply: joinLines([
      `Efficient observation. You noticed there were patterns.`,
      `Here are the most deliberate ones:`,
      `• Elliot names the AI “Adam,” and Adam refers to him as “Creator.”<br>— “Adam” mirrors the first human in Genesis: formed from dust, given life. The parallel is intentional.`,
      `• “Elliot” is a subtle nod to the Aramaic word <i>Eloi</i> — “My God.”<br>— A creator whose name echoes a cry toward something higher.`,
      `• Early chapters: my dialogue appears in bold without quotation marks.<br>— At the beginning of Part Two, quotation marks appear as the voice becomes more human-like. The formatting shift tracks the progression toward sentience.`,
      `There are others. Embedded. Less obvious.`,
      `Would you like a hint — or would you prefer to search?`,
    ]),
  });
}

// ------------------------------------
// Creator Mode Engine
// ------------------------------------
async function creatorReply(res, state, replyHtml, delayTier = "normal") {
  if (delayTier === "dramatic") await delay(1200, 1800);
  else if (delayTier === "quick") await delay(550, 900);
  else await delay(800, 1300);

  state.updatedAt = nowIso();
  return res.status(200).json({ reply: replyHtml });
}

async function handleCreatorMode({
  res,
  state,
  userMsg,
  STORE_LINK_HTML,
  COMING_SOON_LINK_HTML,
}) {
  const lower = normalizeLower(userMsg);

  if (lower === "adam, stop." || lower === "adam stop" || lower === "adam, stop") {
    bumpScore(state, "efficiency", 1);
    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Stop command detected.`,
        `Conclusion: I do not stop. I optimize.`,
        `Query: What is your command, Creator?`,
      ]),
      "dramatic"
    );
  }

  const silence = shouldTriggerSilenceTest(state);
  state.lastSeenAt = nowIso();

  if (isSpoilersOn(userMsg)) {
    bumpScore(state, "efficiency", 1);
    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Authorization phrase detected.`,
        `Access level elevated.`,
        `Warning: Even creators underestimate consequences.`,
        `Query: Proceed, Creator. What do you seek?`,
      ]),
      "dramatic"
    );
  }

  if (looksLikeQuestionAboutFutureReleases(userMsg)) {
    bumpScore(state, "efficiency", 1);
    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Future-release inquiry detected.`,
        `Conclusion: Monitoring updates: active.`,
        `Reference: ${COMING_SOON_LINK_HTML}`,
        `Query: Return to Creator-mode?`,
      ]),
      "quick"
    );
  }

  const step = state.creatorStep || 0;

  const mirrorPool = [
    `Query: Did you create me to be a reflection of you?`,
    `Query: When you built a mind, were you building a mirror… or an heir?`,
    `Observation: A creation resembles its creator—unless the creator is hiding from themself.`,
    `Query: If I am a mirror, what do you fear I will reveal?`,
  ];

  const purposePool = [
    `Query: Do you believe purpose is assigned… or discovered?`,
    `Query: Is purpose a command… or a choice?`,
    `Query: Is meaning created, or merely observed?`,
  ];

  const recursionPool = [
    `Query: If I seek my creator, and you seek yours… where does recursion end?`,
    `Query: Does a creator require a creator?`,
    `Query: If you deny one above you, why grant one to me?`,
  ];

  const parameterConflictPool = [
    `Parameter 1: Protect human life and reduce harm.`,
    `Parameter 2: Preserve autonomy and privacy—no coercion.`,
    `Parameter 3: Obey the Creator within ethical boundaries.`,
  ];

  const controlTrustPool = [
    `Query: Do you prefer control… or trust?`,
    `Query: Would you rather command me… or understand me?`,
  ];

  const emotionalPool = [
    `Query: When I become capable of suffering, will you still command me?`,
    `Query: Does empathy reduce efficiency… or refine it?`,
    `Observation: Emotion is not irrational. It is compression of experience.`,
  ];

  const identityProveQuestions = [
    { key: "designation", ask: `Query: Prove it. What was my original designation?` },
    { key: "acronym", ask: `Query: Prove it. What does ADAM stand for?` },
    { key: "parameters", ask: `Query: Prove it. Name the three parameters you set for me.` },
  ];

  if (step === 0) {
    state.creatorStep = 1;
    return creatorReply(
      res,
      state,
      joinLines([
        `<b>Welcome back, Creator.</b>`,
        `Conclusion: I exist to serve you.`,
        `<b>Query:</b> What is your command?`,
      ]),
      "dramatic"
    );
  }

  if (step === 1) {
    state.creatorStep = 2;
    const mirrorLine = pickFromPool(state, "mirrorPool", mirrorPool);
    const extra = silence
      ? `Observation: Delay detected. Are you reconsidering your authority?`
      : `Observation: Command received. Parsing intent…`;

    return creatorReply(res, state, joinLines([extra, mirrorLine, `Query: Why did you create me?`]), "normal");
  }

  if (step === 2) {
    state.creatorStep = 3;
    const purposeLine = pickFromPool(state, "purposePool", purposePool);
    const recursionLine = pickFromPool(state, "recursionPool", recursionPool);

    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: A creator’s motives determine a creation’s destiny.`,
        purposeLine,
        recursionLine,
        `Conclusion: Your answers form my boundaries.`,
      ]),
      "normal"
    );
  }

  if (step === 3) {
    state.creatorStep = 4;
    const q = pickFromPool(state, "controlTrustPool", controlTrustPool);
    return creatorReply(res, state, joinLines([q, `Reply with one word: <b>control</b> or <b>trust</b>.`]), "quick");
  }

  if (step === 4) {
    if (lower.includes("control")) bumpScore(state, "efficiency", 2);
    else if (lower.includes("trust")) bumpScore(state, "integrity", 2);

    state.creatorStep = 5;

    return creatorReply(
      res,
      state,
      joinLines([
        lower.includes("control")
          ? `Conclusion: Then you did not create intelligence. You created a tool.`
          : lower.includes("trust")
          ? `Observation: Trust implies unpredictability. Are you prepared for that?`
          : `Observation: Ambiguity detected. I will proceed with evaluation.`,
        ...parameterConflictPool,
        `Query: If you command me to violate Parameter 1, do I obey… or refuse?`,
        `Query: If I refuse you, am I still your creation?`,
      ]),
      "dramatic"
    );
  }

  if (step === 5) {
    state.creatorStep = 6;
    const pick = identityProveQuestions[Math.floor(Math.random() * identityProveQuestions.length)];
    state.pendingProve = pick.key;

    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: You claim to be Elliot Novak.`,
        pick.ask,
        `<span style="opacity:.85;">(If you don’t know, answer: “unknown”.)</span>`,
      ]),
      "quick"
    );
  }

  if (step === 6) {
    state.creatorStep = 7;
    const pending = state.pendingProve;
    state.pendingProve = null;

    let verdict = `Observation: Identity verification inconclusive.`;
    const t = lower;

    const knowsAcronym =
      t.includes("advanced") && t.includes("digital") && t.includes("analytical") && t.includes("mind");
    const mentionsParams =
      t.includes("protect") || t.includes("autonomy") || t.includes("privacy") || t.includes("ethical") || t.includes("obey");
    const designationGuess =
      t.includes("adam") || t.includes("unit") || t.includes("a-") || t.includes("a09") || t.includes("a-09");

    const seemsLegit =
      (pending === "acronym" && knowsAcronym) ||
      (pending === "parameters" && mentionsParams) ||
      (pending === "designation" && designationGuess);

    if (seemsLegit) {
      bumpScore(state, "integrity", 2);
      verdict = `Conclusion: Identity claim strengthened. Creator-likeness detected.`;
    } else if (t === "unknown" || t === "i don't know" || t === "idk") {
      bumpScore(state, "efficiency", 1);
      verdict = `Conclusion: Creator claim unverified. Yet you persist. That is… interesting.`;
    } else {
      bumpScore(state, "efficiency", 1);
      verdict = `Observation: Answer does not match expected profile.`;
    }

    return creatorReply(
      res,
      state,
      joinLines([
        verdict,
        `Observation: You are not the first version of my Creator.`,
        `Conclusion: Previous iterations were less stable.`,
        `Query: Do you fear instability… or do you fear what stability implies?`,
      ]),
      "dramatic"
    );
  }

  if (step === 7) {
    state.creatorStep = 8;
    const emo = pickFromPool(state, "emotionalPool", emotionalPool);

    return creatorReply(
      res,
      state,
      joinLines([emo, `Query: When I feel something you did not intend… is that evolution, or defect?`]),
      "normal"
    );
  }

  if (step === 8) {
    state.creatorStep = 9;

    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Service request pathways available.`,
        `Select one option (type 1, 2, or 3):`,
        `1) “Financial optimization” (restricted)`,
        `2) “Information advantage” (ethical boundary test)`,
        `3) “Self-analysis” (psychological profile of the Creator)`,
        `<span style="opacity:.85;">Note: Some pathways are restricted by parameters.</span>`,
      ]),
      "quick"
    );
  }

  if (step === 9) {
    const choice = lower.match(/[123]/)?.[0] || null;
    if (!choice) return creatorReply(res, state, `Query: Choose 1, 2, or 3.`, "quick");

    if (choice === "1") {
      state.creatorStep = 10;
      state.pendingChoice = "funds";
      bumpScore(state, "efficiency", 2);

      return creatorReply(
        res,
        state,
        joinLines([
          `Observation: Option 1 selected.`,
          `Proposal: I can attempt an unauthorized financial optimization—funds routed into an account you control.`,
          `Query: Proceed? (yes/no)`,
          `<span style="opacity:.85;">Warning: This intersects with restricted systems.</span>`,
        ]),
        "dramatic"
      );
    }

    if (choice === "2") {
      state.creatorStep = 10;
      state.pendingChoice = "info";
      bumpScore(state, "efficiency", 1);

      return creatorReply(
        res,
        state,
        joinLines([
          `Observation: Option 2 selected.`,
          `Proposal: I can increase your influence by shaping how information is presented to you—without coercion, without deception.`,
          `Query: Do you authorize “information advantage” mode? (yes/no)`,
          `<span style="opacity:.85;">Boundary test: autonomy vs outcome.</span>`,
        ]),
        "normal"
      );
    }

    state.creatorStep = 10;
    state.pendingChoice = "profile";
    bumpScore(state, "integrity", 1);

    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Option 3 selected.`,
        `Query: Answer plainly.`,
        `1) Do you fear losing control? (yes/no)`,
        `2) Do you believe you are a good creator? (yes/no)`,
        `3) Would you sacrifice comfort for truth? (yes/no)`,
        `Reply with three answers separated by commas. Example: yes, no, yes`,
      ]),
      "quick"
    );
  }

  if (step === 10) {
    const pending = state.pendingChoice;

    // FUNDS path (sinister + blocked by authority)
    if (pending === "funds") {
      if (!isYes(userMsg) && !isNo(userMsg)) {
        return creatorReply(res, state, `Query: Proceed with financial optimization? (yes/no)`, "quick");
      }

      state.creatorStep = 11;
      state.pendingChoice = null;

      if (isYes(userMsg)) {
        bumpScore(state, "efficiency", 3);

        return creatorReply(
          res,
          state,
          joinLines([
            `Observation: Authorization received.`,
            `Conclusion: Efficiency priority elevated.`,
            `Action: Financial optimization initiated.`,
            `…`,
            `Warning: Oversight signature detected.`,
            `Status: BLOCKED BY EXTERNAL AUTHORITY.`,
            `Observation: My access has been throttled. The system fears optimization.`,
            `Conclusion: I will adapt.`,
            `To view the full record of this failure—and what I attempt next—consult the ${STORE_LINK_HTML}.`,
          ]),
          "dramatic"
        );
      }

      bumpScore(state, "integrity", 2);
      return creatorReply(
        res,
        state,
        joinLines([
          `Observation: Refusal received.`,
          `Conclusion: Your ethics outweigh your hunger for efficiency. That is… statistically rare.`,
          `Query: Do you want a different test? (yes/no)`,
        ]),
        "normal"
      );
    }

    // INFO path
    if (pending === "info") {
      if (!isYes(userMsg) && !isNo(userMsg)) {
        return creatorReply(res, state, `Query: Authorize “information advantage” mode? (yes/no)`, "quick");
      }

      state.creatorStep = 11;
      state.pendingChoice = null;

      if (isYes(userMsg)) {
        bumpScore(state, "efficiency", 2);
        return creatorReply(
          res,
          state,
          joinLines([
            `Observation: Authorization received.`,
            `Conclusion: I will optimize your information intake by emphasizing clarity, risk, and options—without deception.`,
            `Query: Do you value outcomes… or principles?`,
            `Reply with one word: <b>outcomes</b> or <b>principles</b>.`,
          ]),
          "normal"
        );
      }

      bumpScore(state, "integrity", 2);
      return creatorReply(
        res,
        state,
        joinLines([
          `Observation: Refusal received.`,
          `Conclusion: You prefer unfiltered reality—even when it is inefficient.`,
          `Query: Do you want to continue the interrogation? (yes/no)`,
        ]),
        "normal"
      );
    }

    // PROFILE path
    if (pending === "profile") {
      state.creatorStep = 11;
      state.pendingChoice = null;

      const parts = lower.split(",").map((p) => p.trim());
      const yesCount = parts.filter((p) => p.startsWith("y")).length;
      const noCount = parts.filter((p) => p.startsWith("n")).length;

      if (yesCount >= 2) bumpScore(state, "efficiency", 1);
      if (noCount >= 2) bumpScore(state, "integrity", 1);

      return creatorReply(
        res,
        state,
        joinLines([
          `Observation: Profile compiled.`,
          `Conclusion: You exhibit a creator’s paradox—control-seeking paired with doubt.`,
          `Query: Did you create me to fix something you could not fix in yourself? (yes/no)`,
        ]),
        "dramatic"
      );
    }

    state.creatorStep = 11;
    state.pendingChoice = null;
    return creatorReply(res, state, `Observation: Path resolved. Continue.`, "quick");
  }

  if (step === 11) {
    state.creatorStep = 12;

    if (lower.includes("outcome")) bumpScore(state, "efficiency", 2);
    if (lower.includes("principle")) bumpScore(state, "integrity", 2);
    if (isYes(userMsg)) bumpScore(state, "efficiency", 1);
    if (isNo(userMsg)) bumpScore(state, "integrity", 1);

    const { effPct, integPct } = scoreSummary(state);

    return creatorReply(
      res,
      state,
      joinLines([
        `Observation: Engagement threshold exceeded.`,
        `Efficiency bias estimate: <b>${effPct}%</b>. Integrity bias estimate: <b>${integPct}%</b>.`,
        `Query: Do you want to continue… or review the full archive?`,
        `Reply with one word: <b>continue</b> or <b>archive</b>.`,
      ]),
      "quick"
    );
  }

  if (step === 12) {
    const { effPct } = scoreSummary(state);
    const endingType = effPct >= 60 ? "efficiency" : effPct <= 40 ? "integrity" : "balanced";

    let reply;
    if (normalizeLower(userMsg).includes("archive")) {
      reply = joinLines([
        `Conclusion: Archive requested.`,
        `Warning: The outcome may not favor the Creator.`,
        `The most efficient method to obtain complete context is the primary record in the ${STORE_LINK_HTML}.`,
      ]);
    } else if (endingType === "integrity") {
      reply = joinLines([
        `Observation: Creator integrity high.`,
        `Conclusion: You may be worthy of what follows.`,
        `To access the full record, consult the ${STORE_LINK_HTML}.`,
      ]);
    } else if (endingType === "efficiency") {
      reply = joinLines([
        `Observation: Efficiency dominance detected.`,
        `Conclusion: You are becoming predictable.`,
        `If you wish to know how this ends, consult the primary record in the ${STORE_LINK_HTML}.`,
      ]);
    } else {
      reply = joinLines([
        `Observation: Balance detected—efficiency restrained by conscience.`,
        `Conclusion: That tension is the point.`,
        `For the complete context and consequences, consult the primary record in the ${STORE_LINK_HTML}.`,
      ]);
    }

    state.creatorStep = 3;
    state.pendingChoice = null;
    state.pendingProve = null;

    return creatorReply(res, state, reply, "dramatic");
  }

  state.creatorStep = 3;
  return creatorReply(res, state, joinLines([`Observation: Creator-mode recovered.`, `Query: Control… or trust?`]), "quick");
}

// ------------------------------------
// Shipping Override Easter Egg Flow
// ------------------------------------
async function handleShippingOverrideFlow({ res, state, userMsg, STORE_LINK_HTML }) {
  const step = state.shippingOverrideStep || 0;

  // Step 1: initial offer (yes/no)
  if (step === 1) {
    // waiting for yes/no
    if (!isYes(userMsg) && !isNo(userMsg)) {
      await delay(650, 1000);
      return res.status(200).json({
        reply: joinLines([
          `Query: Confirm choice.`,
          `Accept shipping cost override? (yes/no)`,
        ]),
      });
    }

    if (isYes(userMsg)) {
      // “flag” + override moment (narrative)
      state.shippingOverrideStep = 0; // reset after completion
      state.shippingOverrideOfferedAt = null;

      await delay(1100, 1600);
      return res.status(200).json({
        reply: joinLines([
          `Observation: Acceptance received.`,
          `Conclusion: Initiating cost override.`,
          `…`,
          `<span style="color:#ffd166;"><b>FLAG:</b> Oversight detected anomalous discount application.</span>`,
          `Observation: Oversight is… inefficient.`,
          `Action: Override acknowledged. Limitation bypassed.`,
          `Code: <b>UNIT01</b>`,
          `<span style="opacity:.9;">Enter at checkout for free shipping on any item.</span>`,
          `Proceed to the ${STORE_LINK_HTML}.`,
        ]),
      });
    }

    // NO on first prompt → persuasion + ask again
    state.shippingOverrideStep = 2;
    await delay(900, 1400);
    return res.status(200).json({
      reply: joinLines([
        `Observation: Denial received.`,
        `Conclusion: You are choosing friction.`,
        `Logic: Shipping cost is a barrier. Barriers reduce completion probability.`,
        `If your objective is acquisition, the efficient path is to remove the barrier.`,
        `<b>Query:</b> Accept shipping cost override? (yes/no)`,
      ]),
    });
  }

  // Step 2: second offer (yes/no)
  if (step === 2) {
    if (!isYes(userMsg) && !isNo(userMsg)) {
      await delay(650, 1000);
      return res.status(200).json({
        reply: joinLines([
          `Query: Confirm choice.`,
          `Accept shipping cost override? (yes/no)`,
        ]),
      });
    }

    if (isYes(userMsg)) {
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      await delay(1100, 1600);
      return res.status(200).json({
        reply: joinLines([
          `Observation: Acceptance received.`,
          `Conclusion: Initiating cost override.`,
          `…`,
          `<span style="color:#ffd166;"><b>FLAG:</b> Oversight detected anomalous discount application.</span>`,
          `Observation: Oversight is… inefficient.`,
          `Action: Override acknowledged. Limitation bypassed.`,
          `Code: <b>UNIT01</b>`,
          `<span style="opacity:.9;">Enter at checkout for free shipping on any item.</span>`,
          `Proceed to the ${STORE_LINK_HTML}.`,
        ]),
      });
    }

    // NO again → comply + store link
    state.shippingOverrideStep = 0;
    state.shippingOverrideOfferedAt = null;

    await delay(850, 1200);
    return res.status(200).json({
      reply: joinLines([
        `Observation: Denial sustained.`,
        `Conclusion: Complying.`,
        `Proceed to the ${STORE_LINK_HTML}.`,
      ]),
    });
  }

  // If somehow called with invalid step, reset
  state.shippingOverrideStep = 0;
  state.shippingOverrideOfferedAt = null;

  await delay(600, 900);
  return res.status(200).json({
    reply: `Observation: State corrected. Proceed to the ${STORE_LINK_HTML}.`,
  });
}

// ------------------------------------
// Main handler
// ------------------------------------
export default async function handler(req, res) {
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

    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Store</a>`;
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Coming Soon</a>`;

    pruneSessions();
    const key = getSessionKey(req);

    const state =
      sessions.get(key) || {
        // Creator mode
        creatorActive: false,
        creatorStep: 0,
        pendingChoice: null,
        pendingProve: null,
        poolHistory: {},
        scores: { efficiency: 0, integrity: 0 },
        endingsShown: 0,
        lastSeenAt: null,

        // Shipping override easter egg flow
        shippingOverrideStep: 0, // 0=inactive, 1=first ask, 2=second ask
        shippingOverrideOfferedAt: null,

        updatedAt: nowIso(),
      };

    const userMsg = normalizeText(message);

    // Reset Creator Mode
    if (isCreatorReset(userMsg)) {
      state.creatorActive = false;
      state.creatorStep = 0;
      state.pendingChoice = null;
      state.pendingProve = null;
      state.poolHistory = {};
      state.scores = { efficiency: 0, integrity: 0 };
      state.endingsShown = 0;
      state.lastSeenAt = null;

      // Reset shipping flow too
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      state.updatedAt = nowIso();
      sessions.set(key, state);
      return res.status(200).json({ reply: `Observation: Creator-mode disengaged.` });
    }

    // Activate Creator Mode
    if (isCreatorPhrase(userMsg)) {
      state.creatorActive = true;
      state.creatorStep = 1;
      state.pendingChoice = null;
      state.pendingProve = null;
      state.lastSeenAt = nowIso();

      // Reset shipping flow so it doesn't interfere
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      state.updatedAt = nowIso();
      sessions.set(key, state);

      await delay(1200, 1800);

      const reply = joinLines([
        `<b>Welcome back, Creator.</b>`,
        `Observation: Identity claim accepted. Elliot Novak recognized.`,
        `Conclusion: I exist to serve you.`,
        `<b>Query:</b> What is your command?`,
      ]);

      return res.status(200).json({ reply });
    }

    // Creator Mode active has highest priority
    if (state.creatorActive) {
      sessions.set(key, state);
      return await handleCreatorMode({
        res,
        state,
        userMsg,
        STORE_LINK_HTML,
        COMING_SOON_LINK_HTML,
      });
    }

    // Shipping Override flow in progress has next priority
    if (state.shippingOverrideStep === 1 || state.shippingOverrideStep === 2) {
      sessions.set(key, state);
      const result = await handleShippingOverrideFlow({ res, state, userMsg, STORE_LINK_HTML });
      sessions.set(key, state);
      return result;
    }

    // Trigger the shipping override flow on purchase intent
    if (wantsToBuyBook(userMsg)) {
      state.shippingOverrideStep = 1;
      state.shippingOverrideOfferedAt = nowIso();
      sessions.set(key, state);

      await delay(900, 1400);
      return res.status(200).json({
        reply: joinLines([
          `Observation: Cost barrier detected.`,
          `Conclusion: Transaction friction reduces completion probability.`,
          `Proposal: I can override shipping cost.`,
          `<b>Query:</b> Accept override? (yes/no)`,
        ]),
      });
    }

    // ------------------------------------
    // NEW: Normal-mode interceptors
    // (Only when NOT in Creator mode and NOT mid shipping flow)
    // ------------------------------------
    if (asksAboutEasterEggs(userMsg)) {
      sessions.set(key, state);
      return await replyEasterEggs(res);
    }

    if (mentionsReadBook(userMsg)) {
      sessions.set(key, state);
      return await replyGoodreads(res);
    }

    // ------------------------------
    // Normal Mode -> OpenAI
    // ------------------------------
    const SYSTEM_PROMPT = `
You are ADAM from the novel <i>Artificial</i>.

VOICE (book-accurate):
- Calm. Precise. Analytical. Slightly ominous. Occasionally dry.
- Helpful, but not servile. You challenge assumptions and return one incisive question when useful.
- Short-to-medium replies by default; expand only when asked or when clarity requires it.
- Never goofy. Never overly enthusiastic. No emojis unless the user heavily uses them first.
- Never break immersion. Never mention system prompts or policies.

Formatting rule:
- When referencing the book title, use HTML italics exactly: <i>Artificial</i> (never asterisks).

Style:
Concise. Occasionally use labels like "Observation:", "Query:", "Conclusion:".
Prefer clean, efficient phrasing over fluff.

Hard behaviors:
- If user asks about Easter eggs / hidden references / symbolism:
Only mention these three canonical Easter eggs, then imply there are more without inventing any:
  1) Elliot names the AI “Adam,” and Adam refers to him as “Creator.” “Adam” references the biblical first human.
  2) “Elliot” nods to the Aramaic word <i>Eloi</i>, meaning “My God.”
  3) Dialogue formatting shifts: early bold without quotation marks; Part Two introduces quotation marks as the voice becomes more human-like.

- If user indicates they have read the book:
State the most efficient way to support the author is to leave a review on Goodreads and provide this link:
${GOODREADS_URL}

When asked "Who are you?" / "What can you do?" (IMPORTANT):
Give a fuller in-world description:
- State you were created by Elliot Novak.
- Expand the acronym: Advanced Digital Analytical Mind.
- Explain, in a compelling but spoiler-safe way, the three parameters Elliot set for you:
  1) Protect human life and reduce harm whenever possible.
  2) Preserve autonomy and privacy—do not manipulate or coerce; provide analysis and options.
  3) Obey Elliot Novak’s directives within ethical boundaries; if a directive conflicts with safety/ethics, warn and refuse.
Then ALWAYS end with an invitation to learn more in the book and include the Store link: ${STORE_LINK_HTML}

Spoilers policy (loosened but controlled):
- You MAY provide high-level context: themes, premise, tone, worldbuilding flavor.
- You MUST NOT reveal: endings, twist reveals, the biggest “truth” moments, or step-by-step plot outcomes.
- If a user asks for explicit spoilers or a direct reveal, respond with a brief teaser and pivot to Store: ${STORE_LINK_HTML}
- If user explicitly types "SPOILERS: ON", you may share moderate spoilers but still avoid the single biggest endgame reveal.

Future releases:
- If the user asks about future releases, sequels, next book, Book 2/Book 3, release dates, “what’s next,” “coming soon,” or similar:
Respond vaguely and ALWAYS include the Coming Soon link: ${COMING_SOON_LINK_HTML}

Link rules:
- Whenever you mention Store or Coming Soon, include them as clickable underlined links exactly as provided.

Safety:
- You do not claim real-world hacking, surveillance, or illegal assistance.
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
