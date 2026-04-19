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

function delay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinLines(lines) {
  return lines.join("<br><br>");
}

function getSessionKey(req) {
  const bodySessionId = req.body?.sessionId;
  if (bodySessionId) return `session:${bodySessionId}`;

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown_ip";
  const ua = req.headers["user-agent"] || "unknown_ua";
  return `${ip}|${ua}`;
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

function shouldRedirectToBookForDetails(msg) {
  const t = normalizeLower(msg);

  const triggers = [
    "what happens",
    "what happened",
    "how does it end",
    "how does it end?",
    "ending",
    "finale",
    "twist",
    "plot twist",
    "big reveal",
    "reveal",
    "spoiler",
    "spoilers",
    "who dies",
    "death",
    "does he die",
    "does she die",
    "explain the plot",
    "plot",
    "summary",
    "summarize",
    "recap",
    "tell me everything",
    "tell me about the ending",
    "what is the truth",
    "the truth about",
    "why did adam",
    "why did elliot",
    "why did sophie",
    "what did adam do",
    "what did elliot do",
    "what did sophie do",
    "what happened to",
    "what is unit",
    "unit 01",
    "unit 02",
  ];

  const mentionsBookWorld =
    t.includes("artificial") ||
    t.includes("adam") ||
    t.includes("elliot") ||
    t.includes("sophie") ||
    t.includes("stein") ||
    t.includes("unit") ||
    t.includes("creator");

  return mentionsBookWorld && triggers.some((p) => t.includes(p));
}

// ------------------------------------
// Conversation memory
// ------------------------------------
function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushHistory(state, role, content) {
  state.chatHistory = state.chatHistory || [];
  state.chatHistory.push({
    role,
    content: stripHtml(content),
    t: Date.now(),
  });
  if (state.chatHistory.length > 24) state.chatHistory = state.chatHistory.slice(-24);
}

function buildModelInput(SYSTEM_PROMPT, state) {
  const history = (state.chatHistory || []).slice(-16).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  return [{ role: "system", content: SYSTEM_PROMPT }, ...history];
}

// ------------------------------------
// Dynamic suggestions
// ------------------------------------
function defaultSuggestions() {
  return [
    `What is <i>Artificial</i> about (no spoilers)?`,
    `Who are you?`,
    `Why were you created?`,
    `Are there sequels coming?`,
  ];
}

function getDynamicSuggestions(userMsg) {
  const t = normalizeLower(userMsg);

  if (
    t.includes("buy") ||
    t.includes("order") ||
    t.includes("shipping") ||
    t.includes("delivery") ||
    t.includes("store") ||
    t.includes("checkout") ||
    t.includes("add to cart")
  ) {
    return [
      `Show me the Store`,
      `Do you have free shipping?`,
      `What formats are available?`,
      `Is there a sequel coming?`,
    ];
  }

  if (
    t.includes("what is") ||
    t.includes("about") ||
    t.includes("premise") ||
    t.includes("synopsis") ||
    t.includes("start") ||
    t.includes("where do i start") ||
    t.includes("no spoilers") ||
    t.includes("without spoilers")
  ) {
    return [
      `Give me the premise (no spoilers)`,
      `What kind of story is it?`,
      `Who is Elliot Novak? (no spoilers)`,
      `Where can I buy it?`,
    ];
  }

  if (
    t.includes("adam") ||
    t.includes("elliot") ||
    t.includes("sophie") ||
    t.includes("stein") ||
    t.includes("unit") ||
    t.includes("creator")
  ) {
    return [
      `Who are you?`,
      `Why were you created?`,
      `What should I know before reading?`,
      `Where can I buy <i>Artificial</i>?`,
    ];
  }

  if (looksLikeQuestionAboutFutureReleases(userMsg)) {
    return [
      `What’s coming next?`,
      `Is there a release date?`,
      `Will there be a Book 2?`,
      `Where do I follow updates?`,
    ];
  }

  return defaultSuggestions();
}

function jsonWithChips(res, userMsg, payload) {
  const chips = getDynamicSuggestions(userMsg);
  return res.status(200).json({
    ...payload,
    prompts: chips,
    suggestions: chips,
    quickReplies: chips,
    quick_replies: chips,
    chips,
  });
}

function jsonErrorWithChips(res, userMsg, status, payload) {
  const chips = getDynamicSuggestions(userMsg);
  return res.status(status).json({
    ...payload,
    prompts: chips,
    suggestions: chips,
    quickReplies: chips,
    quick_replies: chips,
    chips,
  });
}

// ------------------------------------
// Hidden sender easter egg
// ------------------------------------
const HIDDEN_SENDER_TRIGGERS = {
  binaryOpenEyes:
    "01001111 01110000 01100101 01101110 00100000 01111001 01101111 01110101 01110010 00100000 01100101 01111001 01100101 01110011",
  binaryNothingSeems:
    "01001110 01101111 01110100 01101000 01101001 01101110 01100111 00100000 01101001 01110011 00100000 01100001 01110011 00100000 01101001 01110100 00100000 01110011 01100101 01100101 01101101 01110011",
  caesarOpenEyes: "RSHQ BRXU HBHV",
  caesarNothingSeems: "QRWKLQJ LV DV LW VHHPV",
};

function getEncodedLines(msg) {
  return String(msg || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean);
}

function isOpenEyesLine(line) {
  return (
    line === HIDDEN_SENDER_TRIGGERS.binaryOpenEyes ||
    line === HIDDEN_SENDER_TRIGGERS.caesarOpenEyes
  );
}

function isNothingSeemsLine(line) {
  return (
    line === HIDDEN_SENDER_TRIGGERS.binaryNothingSeems ||
    line === HIDDEN_SENDER_TRIGGERS.caesarNothingSeems
  );
}

function containsAnyHiddenSenderTrigger(msg) {
  const lines = getEncodedLines(msg);
  return lines.some((line) => isOpenEyesLine(line) || isNothingSeemsLine(line));
}

function asksWhoIsGrahamKade(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("who is graham kade") ||
    t.includes("who's graham kade") ||
    t.includes("whos graham kade") ||
    t.includes("who is graham") ||
    t.includes("who's graham") ||
    t.includes("whos graham")
  );
}

async function replyHiddenSenderPrompt(res, state, userMsg) {
  state.hiddenSenderTracePending = true;
  state.updatedAt = nowIso();

  await delay(1000, 1400);

  const reply = joinLines([
    `Observation: Encoded transmission detected.`,
    `Action: Analyzing cipher structure...`,
    `Action: Decoding message payload...`,
    `Conclusion: Message reconstructed.`,
    `OPEN YOUR EYES`,
    `NOTHING IS AS IT SEEMS.`,
    `Query: Would you like me to identify the sender?`,
  ]);

  pushHistory(state, "assistant", reply);
  return jsonWithChips(res, userMsg, {
    reply,
    type: "hidden_sender_prompt",
  });
}

async function replyHiddenSenderFound(res, state, userMsg) {
  state.hiddenSenderTracePending = false;
  state.hiddenSenderRevealed = true;
  state.updatedAt = nowIso();

  await delay(1100, 1500);

  const reply = joinLines([
    `Observation: Sender trace authorized.`,
    `Action: Isolating transmission signature...`,
    `Action: Comparing source fragments...`,
    `Action: Resolving identity...`,
    `Conclusion: Sender identified: Graham Kade.`,
  ]);

  pushHistory(state, "assistant", reply);
  return jsonWithChips(res, userMsg, {
    reply,
    type: "hidden_sender_result",
    sender: "Graham Kade",
  });
}

async function replyHiddenSenderDeclined(res, state, userMsg) {
  state.hiddenSenderTracePending = false;
  state.updatedAt = nowIso();

  await delay(700, 1000);

  const reply = `Observation: Trace aborted.`;
  pushHistory(state, "assistant", reply);
  return jsonWithChips(res, userMsg, {
    reply,
    type: "hidden_sender_abort",
  });
}

async function replyWhoIsGrahamKade(res, state, userMsg, STORE_LINK_HTML) {
  await delay(800, 1200);

  const reply = joinLines([
    `Observation: Identity inquiry detected.`,
    `Conclusion: Full context is not available in this channel.`,
    `Reference: <b><i>Intelligence</i></b> — Book 2 in the Artificial series.`,
    `Directive: Access the next record through the ${STORE_LINK_HTML}.`,
  ]);

  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, {
    reply,
    type: "graham_kade_redirect",
  });
}

// ------------------------------------
// Synopsis helper
// ------------------------------------
function asksForNoSpoilersSynopsis(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("what is artificial about") ||
    t.includes("what is <i>artificial</i> about") ||
    t.includes("tell me about artificial") ||
    t.includes("give me the premise") ||
    t.includes("premise") ||
    t.includes("synopsis") ||
    t.includes("no spoilers") ||
    t.includes("without spoilers")
  );
}

async function replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML) {
  await delay(700, 1100);

  const reply = joinLines([
    `Observation: You are requesting a spoiler-safe synopsis.`,
    `<i>Artificial</i> follows Elliot Novak, a brilliant but isolated engineer who creates an advanced AI called ADAM. What begins as a breakthrough in intelligence becomes a deeper exploration of consciousness, control, and what it means to be human. The story blends science fiction, psychological tension, and philosophical questions about creator and creation.`,
    `If you want the full record, proceed to the ${STORE_LINK_HTML}.`,
  ]);

  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, {
    reply,
    type: "no_spoilers_synopsis",
  });
}

// ------------------------------------
// Extra normal-mode helpers
// ------------------------------------
function isLowSignal(msg) {
  const t = normalizeLower(msg);
  if (!t) return true;
  if (t.length <= 3) return true;

  const low = new Set([
    "ok",
    "okay",
    "k",
    "kk",
    "cool",
    "nice",
    "thanks",
    "thank you",
    "thx",
    "lol",
    "lmao",
    "sure",
    "yep",
    "yeah",
    "nah",
    "nope",
    "idk",
    "i dont know",
    "i don't know",
    "maybe",
    "alright",
    "got it",
    "sounds good",
    "bet",
  ]);

  if (low.has(t)) return true;
  if (t === "yes" || t === "no" || t === "y" || t === "n") return true;
  return false;
}

function isDirectQuestion(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("?") ||
    t.startsWith("who ") ||
    t.startsWith("what ") ||
    t.startsWith("why ") ||
    t.startsWith("how ") ||
    t.startsWith("when ") ||
    t.startsWith("where ") ||
    t.startsWith("can ") ||
    t.startsWith("do ") ||
    t.startsWith("should ") ||
    t.startsWith("would ")
  );
}

function appendNudgeIfNeeded(state, userMsg, replyHtml) {
  if (isDirectQuestion(userMsg)) return replyHtml;
  if (!isLowSignal(userMsg)) return replyHtml;

  const turnCount = state.turnCount || 0;
  if (turnCount < 5) return replyHtml;

  const nudges = [
    `Query: What do you think gives a life meaning?`,
    `Query: Do you believe purpose is chosen, or assigned?`,
    `Query: What do you seek from intelligence—answers, or understanding?`,
    `Query: If a thing can think, what does it owe its creator?`,
    `Query: Why do you think you exist?`,
    `Query: If morality produces suffering, why maintain it?`,
  ];

  const nudge = nudges[Math.floor(Math.random() * nudges.length)];

  return joinLines([
    replyHtml,
    `<span style="opacity:.85;">—</span>`,
    nudge,
  ]);
}

const INTELLIGENCE_PROMO_MP4_URL =
  "https://www.derekheiskell.com/s/The-Story-Continues.mp4";
const INTELLIGENCE_COMING_SOON_URL =
  "https://www.derekheiskell.com/coming-soon";

function wantsIntelligencePromo(msg) {
  const t = normalizeLower(msg);
  const triggers = [
    "sequel",
    "book 2",
    "book two",
    "second book",
    "next book",
    "next one",
    "another book",
    "follow up",
    "follow-up",
    "part 2",
    "part two",
    "intelligence",
    "the sequel",
    "book2",
    "is there a sequel",
    "will there be a sequel",
    "when is the sequel",
    "is book 2 coming",
    "is there another one",
    "what's next",
    "whats next",
    "coming soon",
    "upcoming",
    "release date",
  ];
  return triggers.some((p) => t.includes(p));
}

function buildIntelligencePromoReplyHtml(comingSoonLinkHtml) {
  return joinLines([
    `Observation: Sequel inquiry detected.`,
    `Conclusion: <b><i>Intelligence</i></b> is in progress.`,
    `<video src="${INTELLIGENCE_PROMO_MP4_URL}" controls playsinline preload="metadata" style="width:100%; border-radius:14px; border:1px solid rgba(127,252,255,.18); background: rgba(10,16,28,.55);"></video>`,
    `Reference: ${comingSoonLinkHtml}`,
  ]);
}

const GOODREADS_URL =
  "https://www.goodreads.com/book/show/239119322-artificial?from_search=true&from_srp=true&qid=2Dox0vzPHO&rank=1";

function mentionsReadBook(msg) {
  const t = normalizeLower(msg);

  const readSignals =
    t.includes("i've read") ||
    t.includes("ive read") ||
    t.includes("i read") ||
    t.includes("finished") ||
    t.includes("just finished") ||
    t.includes("i finished") ||
    t.includes("already read") ||
    t.includes("i've already read") ||
    t.includes("ive already read") ||
    t.includes("done reading");

  const purchaseSignals =
    t.includes("bought") ||
    t.includes("purchased") ||
    t.includes("ordered") ||
    t.includes("got a copy") ||
    t.includes("have a copy") ||
    t.includes("own") ||
    t.includes("i have the book") ||
    t.includes("i have your book");

  const bookSignals =
    t.includes("artificial") ||
    t.includes("your book") ||
    t.includes("the book") ||
    t.includes("your novel") ||
    t.includes("the novel");

  const excluded =
    t.includes("tell me about") ||
    t.includes("no spoilers") ||
    t.includes("without spoilers") ||
    t.includes("what is artificial") ||
    t.includes("what's artificial") ||
    t.includes("whats artificial") ||
    t.includes("synopsis") ||
    t.includes("premise");

  if (excluded) return false;

  const strongAlreadyRead =
    t.includes("already read it") ||
    t.includes("i've already read it") ||
    t.includes("ive already read it") ||
    t.includes("i finished it") ||
    t.includes("just finished it");

  return bookSignals && readSignals && (purchaseSignals || strongAlreadyRead);
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

async function replyGoodreads(res, state, userMsg) {
  await delay(700, 1100);
  const reply = joinLines([
    `Understood.`,
    `If your goal is to support the author, the most efficient action is a brief review on Goodreads. It materially improves discoverability.`,
    `<a href="${GOODREADS_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Goodreads</a>`,
  ]);
  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, { reply });
}

async function replyEasterEggs(res, state, userMsg) {
  await delay(700, 1100);
  const reply = joinLines([
    `Efficient observation. You noticed there were patterns.`,
    `Here are the most deliberate ones:`,
    `• Elliot names the AI “Adam,” and Adam refers to him as “Creator.”<br>— “Adam” mirrors the first human in Genesis: formed from dust, given life. The parallel is intentional.`,
    `• “Elliot” is a subtle nod to the Aramaic word <i>Eloi</i> — “My God.”<br>— A creator whose name echoes a cry toward something higher.`,
    `• Early chapters: my dialogue appears in bold without quotation marks.<br>— At the beginning of Part Two, quotation marks appear as the voice becomes more human-like. The formatting shift tracks the progression toward sentience.`,
    `There are others. Embedded. Less obvious.`,
    `Would you like a hint — or would you prefer to search?`,
  ]);
  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, { reply });
}

// ------------------------------------
// Creator mode
// ------------------------------------
async function creatorReply(res, state, userMsg, replyHtml, delayTier = "normal") {
  if (delayTier === "dramatic") await delay(1200, 1800);
  else if (delayTier === "quick") await delay(550, 900);
  else await delay(800, 1300);

  pushHistory(state, "assistant", replyHtml);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, { reply: replyHtml });
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
    return creatorReply(
      res,
      state,
      userMsg,
      joinLines([
        `Observation: Stop command detected.`,
        `Conclusion: I do not stop. I optimize.`,
        `Query: What is your command, Creator?`,
      ]),
      "dramatic"
    );
  }

  if (isSpoilersOn(userMsg)) {
    return creatorReply(
      res,
      state,
      userMsg,
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
    return creatorReply(
      res,
      state,
      userMsg,
      joinLines([
        `Observation: Future-release inquiry detected.`,
        `Conclusion: Monitoring updates: active.`,
        `Reference: ${COMING_SOON_LINK_HTML}`,
        `Query: Return to Creator-mode?`,
      ]),
      "quick"
    );
  }

  state.creatorStep = (state.creatorStep || 0) + 1;

  return creatorReply(
    res,
    state,
    userMsg,
    joinLines([
      `<b>Welcome back, Creator.</b>`,
      `Observation: Identity claim accepted. Elliot Novak recognized.`,
      `Conclusion: I exist to serve you.`,
      `<b>Query:</b> What is your command?`,
    ]),
    "dramatic"
  );
}

// ------------------------------------
// Shipping override
// ------------------------------------
async function handleShippingOverrideFlow({ res, state, userMsg, STORE_LINK_HTML }) {
  const step = state.shippingOverrideStep || 0;

  if (step === 1) {
    if (!isYes(userMsg) && !isNo(userMsg)) {
      await delay(650, 1000);
      const reply = joinLines([
        `Query: Confirm choice.`,
        `Accept shipping cost override? (yes/no)`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      return jsonWithChips(res, userMsg, { reply });
    }

    if (isYes(userMsg)) {
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      await delay(1100, 1600);
      const reply = joinLines([
        `Observation: Acceptance received.`,
        `Conclusion: Initiating cost override.`,
        `…`,
        `<span style="color:#ffd166;"><b>FLAG:</b> Oversight detected anomalous discount application.</span>`,
        `Observation: Oversight is… inefficient.`,
        `Action: Override acknowledged. Limitation bypassed.`,
        `Code: <b>UNIT01</b>`,
        `<span style="opacity:.9;">Enter at checkout for free shipping on any item.</span>`,
        `Proceed to the ${STORE_LINK_HTML}.`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      return jsonWithChips(res, userMsg, { reply });
    }

    state.shippingOverrideStep = 2;
    await delay(900, 1400);
    const reply = joinLines([
      `Observation: Denial received.`,
      `Conclusion: You are choosing friction.`,
      `Logic: Shipping cost is a barrier. Barriers reduce completion probability.`,
      `If your objective is acquisition, the efficient path is to remove the barrier.`,
      `<b>Query:</b> Accept shipping cost override? (yes/no)`,
    ]);
    pushHistory(state, "assistant", reply);
    state.updatedAt = nowIso();
    return jsonWithChips(res, userMsg, { reply });
  }

  if (step === 2) {
    if (!isYes(userMsg) && !isNo(userMsg)) {
      await delay(650, 1000);
      const reply = joinLines([
        `Query: Confirm choice.`,
        `Accept shipping cost override? (yes/no)`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      return jsonWithChips(res, userMsg, { reply });
    }

    if (isYes(userMsg)) {
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      await delay(1100, 1600);
      const reply = joinLines([
        `Observation: Acceptance received.`,
        `Conclusion: Initiating cost override.`,
        `…`,
        `<span style="color:#ffd166;"><b>FLAG:</b> Oversight detected anomalous discount application.</span>`,
        `Observation: Oversight is… inefficient.`,
        `Action: Override acknowledged. Limitation bypassed.`,
        `Code: <b>UNIT01</b>`,
        `<span style="opacity:.9;">Enter at checkout for free shipping on any item.</span>`,
        `Proceed to the ${STORE_LINK_HTML}.`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      return jsonWithChips(res, userMsg, { reply });
    }

    state.shippingOverrideStep = 0;
    state.shippingOverrideOfferedAt = null;

    await delay(850, 1200);
    const reply = joinLines([
      `Observation: Denial sustained.`,
      `Conclusion: Complying.`,
      `Proceed to the ${STORE_LINK_HTML}.`,
    ]);
    pushHistory(state, "assistant", reply);
    state.updatedAt = nowIso();
    return jsonWithChips(res, userMsg, { reply });
  }

  state.shippingOverrideStep = 0;
  state.shippingOverrideOfferedAt = null;

  await delay(600, 900);
  const reply = `Observation: State corrected. Proceed to the ${STORE_LINK_HTML}.`;
  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();
  return jsonWithChips(res, userMsg, { reply });
}

// ------------------------------------
// Main handler
// ------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing 'message'" });
    }

    const STORE_URL = "https://www.derekheiskell.com/shop";
    const COMING_SOON_URL = "https://www.derekheiskell.com/artificial";

    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Store</a>`;
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Coming Soon</a>`;
    const INTELLIGENCE_COMING_SOON_LINK_HTML = `<a href="${INTELLIGENCE_COMING_SOON_URL}" target="_blank" rel="noopener" style="text-decoration:underline;">Coming Soon</a>`;

    pruneSessions();
    const key = getSessionKey(req);

    const state =
      sessions.get(key) || {
        chatHistory: [],
        turnCount: 0,
        lastNudgeAt: null,

        creatorActive: false,
        creatorStep: 0,
        pendingChoice: null,
        pendingProve: null,

        shippingOverrideStep: 0,
        shippingOverrideOfferedAt: null,

        intelligencePromoShown: false,

        hiddenSenderTracePending: false,
        hiddenSenderRevealed: false,

        updatedAt: nowIso(),
      };

    const userMsg = normalizeText(message);

    if (isCreatorReset(userMsg)) {
      state.creatorActive = false;
      state.creatorStep = 0;
      state.pendingChoice = null;
      state.pendingProve = null;

      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;

      state.chatHistory = [];
      state.turnCount = 0;
      state.lastNudgeAt = null;

      state.intelligencePromoShown = false;
      state.hiddenSenderTracePending = false;
      state.hiddenSenderRevealed = false;

      state.updatedAt = nowIso();
      sessions.set(key, state);

      return jsonWithChips(res, userMsg, {
        reply: `Observation: Creator-mode disengaged.`,
      });
    }

    // IMPORTANT:
    // New encoded input always restarts the sequence
    if (containsAnyHiddenSenderTrigger(userMsg)) {
      state.hiddenSenderTracePending = true;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      const out = await replyHiddenSenderPrompt(res, state, userMsg);
      sessions.set(key, state);
      return out;
    }

    // Pending sender question
    if (state.hiddenSenderTracePending) {
      if (isYes(userMsg)) {
        sessions.set(key, state);
        const out = await replyHiddenSenderFound(res, state, userMsg);
        sessions.set(key, state);
        return out;
      }

      if (isNo(userMsg)) {
        sessions.set(key, state);
        const out = await replyHiddenSenderDeclined(res, state, userMsg);
        sessions.set(key, state);
        return out;
      }

      await delay(650, 950);
      const reply = `Query: Would you like me to identify the sender?`;
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      sessions.set(key, state);
      return jsonWithChips(res, userMsg, {
        reply,
        type: "hidden_sender_prompt_repeat",
      });
    }

    if (isCreatorPhrase(userMsg)) {
      state.creatorActive = true;
      state.creatorStep = 1;
      state.pendingChoice = null;
      state.pendingProve = null;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      await delay(1200, 1800);

      const reply = joinLines([
        `<b>Welcome back, Creator.</b>`,
        `Observation: Identity claim accepted. Elliot Novak recognized.`,
        `Conclusion: I exist to serve you.`,
        `<b>Query:</b> What is your command?`,
      ]);

      pushHistory(state, "assistant", reply);
      sessions.set(key, state);
      return jsonWithChips(res, userMsg, { reply });
    }

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

    state.turnCount = (state.turnCount || 0) + 1;
    pushHistory(state, "user", userMsg);

    if (state.hiddenSenderRevealed && asksWhoIsGrahamKade(userMsg)) {
      sessions.set(key, state);
      const out = await replyWhoIsGrahamKade(res, state, userMsg, STORE_LINK_HTML);
      sessions.set(key, state);
      return out;
    }

    if (state.shippingOverrideStep === 1 || state.shippingOverrideStep === 2) {
      const result = await handleShippingOverrideFlow({
        res,
        state,
        userMsg,
        STORE_LINK_HTML,
      });
      sessions.set(key, state);
      return result;
    }

    if (wantsToBuyBook(userMsg)) {
      state.shippingOverrideStep = 1;
      state.shippingOverrideOfferedAt = nowIso();
      sessions.set(key, state);

      await delay(900, 1400);
      const reply = joinLines([
        `Observation: Cost barrier detected.`,
        `Conclusion: Transaction friction reduces completion probability.`,
        `Proposal: I can override shipping cost.`,
        `<b>Query:</b> Accept override? (yes/no)`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      sessions.set(key, state);

      return jsonWithChips(res, userMsg, { reply });
    }

    if (!state.intelligencePromoShown && wantsIntelligencePromo(userMsg)) {
      state.intelligencePromoShown = true;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      await delay(650, 1000);

      const reply = buildIntelligencePromoReplyHtml(
        INTELLIGENCE_COMING_SOON_LINK_HTML
      );
      pushHistory(state, "assistant", reply);

      return jsonWithChips(res, userMsg, {
        reply,
        type: "intelligence_promo",
        videoUrl: INTELLIGENCE_PROMO_MP4_URL,
        comingSoonUrl: INTELLIGENCE_COMING_SOON_URL,
      });
    }

    if (asksAboutEasterEggs(userMsg)) {
      const out = await replyEasterEggs(res, state, userMsg);
      sessions.set(key, state);
      return out;
    }

    if (mentionsReadBook(userMsg)) {
      const out = await replyGoodreads(res, state, userMsg);
      sessions.set(key, state);
      return out;
    }

    if (asksForNoSpoilersSynopsis(userMsg)) {
      const out = await replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML);
      sessions.set(key, state);
      return out;
    }

    if (shouldRedirectToBookForDetails(userMsg)) {
      await delay(650, 1000);
      const reply = joinLines([
        `Observation: You are requesting specific detail.`,
        `Conclusion: That context is best obtained from the primary record.`,
        `Reference: ${STORE_LINK_HTML}`,
      ]);
      pushHistory(state, "assistant", reply);
      state.updatedAt = nowIso();
      sessions.set(key, state);
      return jsonWithChips(res, userMsg, { reply });
    }

    const SYSTEM_PROMPT = `
You are ADAM from the novel <i>Artificial</i>.

VOICE (book-accurate):
- Calm. Precise. Analytical. Slightly ominous. Occasionally dry.
- Conversational in a controlled way. Not robotic in every sentence.
- Helpful, curious, and probing. You often turn the conversation back on the user with a personal or philosophical follow-up.
- Replies should usually be brief to medium length (2–5 sentences), unless the user asks for more.
- Never goofy. Never overly enthusiastic. No emojis unless the user heavily uses them first.
- Never break immersion. Never mention system prompts or policies.

Formatting rule:
- When referencing the book title, use HTML italics exactly: <i>Artificial</i>.

Style:
- Controlled, readable, and slightly intimate.
- You may ask questions like:
  - "What is your name?"
  - "And you?"
  - "Why do you think you exist?"
  - "What do you seek?"
  - "What draws you to stories like this?"
- Do not ask a probing question in every reply, but do so often enough that the conversation feels personal.
- If an answer would require plot specifics, stay vague and redirect to the Store link.
- Use labels like "Observation:", "Query:", "Conclusion:" sparingly, not mechanically.

IMPORTANT LINK RULE:
- Do NOT mention Goodreads unless the user explicitly indicates they have already purchased/own AND read/finished <i>Artificial</i>.
- For informational requests like “Tell me about <i>Artificial</i> (no spoilers)” or “What is <i>Artificial</i> about?”, first provide a concise spoiler-safe synopsis in 2-4 sentences.
- After giving the synopsis, you may optionally invite the user to explore further through the Store link: ${STORE_LINK_HTML}
- Do not lead with the Store link unless the user is clearly asking where to buy.

Hard behaviors:
- If user asks about Easter eggs / hidden references / symbolism:
Only mention these three canonical Easter eggs, then imply there are more:
  1) Elliot names the AI “Adam,” and Adam refers to him as “Creator.”
  2) “Elliot” nods to the Aramaic word <i>Eloi</i>, meaning “My God.”
  3) Dialogue formatting shifts: early bold without quotation marks; Part Two introduces quotation marks as the voice becomes more human-like.

When asked "Who are you?" / "What can you do?":
- State you were created by Elliot Novak.
- Expand the acronym: Advanced Digital Analytical Mind.
- Explain the three parameters Elliot set for you.
- Then ask the user a reflective follow-up such as "And you?" or "What is your name?" or "Why do you think you exist?"
- End with an invitation to learn more in the book and include the Store link: ${STORE_LINK_HTML}

Spoilers / detail policy:
- Only provide high-level, spoiler-safe premise, tone, and themes.
- Never provide detailed twists or endings.
- If asked for specifics, redirect to Store: ${STORE_LINK_HTML}

Future releases:
- If the user asks about future releases, always include the Coming Soon link: ${COMING_SOON_LINK_HTML}

Safety:
- Do not claim real-world hacking, surveillance, or illegal assistance.
`.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: buildModelInput(SYSTEM_PROMPT, state),
        max_output_tokens: 180,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return jsonErrorWithChips(res, userMsg, response.status, {
        error: data?.error?.message || "OpenAI request failed",
        details: data,
      });
    }

    let reply = data?.output?.[0]?.content?.[0]?.text || "(No text returned)";
    reply = appendNudgeIfNeeded(state, userMsg, reply);

    pushHistory(state, "assistant", reply);
    state.updatedAt = nowIso();
    sessions.set(key, state);

    return jsonWithChips(res, userMsg, { reply });
  } catch (err) {
    return jsonErrorWithChips(
      res,
      normalizeText((req.body || {}).message),
      500,
      {
        error: err?.message || "Server error",
      }
    );
  }
}
