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

function getPageUrl(req) {
  return (
    normalizeText(req.body?.pageUrl) ||
    normalizeText(req.headers["referer"]) ||
    normalizeText(req.headers["origin"]) ||
    ""
  );
}

// ------------------------------------
// Analytics
// ------------------------------------
async function sendAnalytics(payload) {
  const url = process.env.GOOGLE_APPS_SCRIPT_ANALYTICS_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    // Analytics should never break chat.
  }
}

async function trackEvent({
  sessionId,
  eventType,
  pageUrl = "",
  location = "",
  userMessage = "",
  metadata = {},
}) {
  await sendAnalytics({
    kind: "event",
    sessionId: sessionId || "",
    eventType: eventType || "",
    pageUrl,
    location,
    userMessage,
    metadata,
  });
}

function incrementAssistantCount(state) {
  state.adamMessageCount = (state.adamMessageCount || 0) + 1;
}

async function finalizeAssistantReply({
  res,
  state,
  userMsg,
  reply,
  payload = {},
  sessionId,
  pageUrl = "",
  track = [],
}) {
  pushHistory(state, "assistant", reply);
  incrementAssistantCount(state);
  state.updatedAt = nowIso();

  for (const item of track) {
    if (!item || !item.eventType) continue;
    await trackEvent({
      sessionId,
      eventType: item.eventType,
      pageUrl,
      location: item.location || "chat_reply",
      userMessage: userMsg,
      metadata: item.metadata || {},
    });
  }

  return jsonWithChips(res, userMsg, {
    reply,
    ...payload,
  });
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
    t.includes("novel") ||
    t.includes("copy") ||
    t.includes("paperback") ||
    t.includes("hardcover") ||
    t.includes("ebook");

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
    t.includes("delivery") ||
    t.includes("price") ||
    t.includes("cost") ||
    t.includes("how much") ||
    t.includes("discount") ||
    t.includes("coupon") ||
    t.includes("promo code") ||
    t.includes("sale") ||
    t.includes("deal") ||
    t.includes("cheaper");

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
  if (state.chatHistory.length > 24) {
    state.chatHistory = state.chatHistory.slice(-24);
  }
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
    t.includes("add to cart") ||
    t.includes("price") ||
    t.includes("cost") ||
    t.includes("discount") ||
    t.includes("coupon") ||
    t.includes("promo code") ||
    t.includes("sale") ||
    t.includes("deal")
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

async function replyHiddenSenderPrompt(res, state, userMsg, ctx) {
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

  return finalizeAssistantReply({
    res,
    state,
    userMsg,
    reply,
    payload: { type: "hidden_sender_prompt" },
    sessionId: ctx.sessionId,
    pageUrl: ctx.pageUrl,
  });
}

async function replyHiddenSenderFound(res, state, userMsg, ctx) {
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

  return finalizeAssistantReply({
    res,
    state,
    userMsg,
    reply,
    payload: {
      type: "hidden_sender_result",
      sender: "Graham Kade",
    },
    sessionId: ctx.sessionId,
    pageUrl: ctx.pageUrl,
  });
}

async function replyHiddenSenderDeclined(res, state, userMsg, ctx) {
  state.hiddenSenderTracePending = false;
  state.updatedAt = nowIso();

  await delay(700, 1000);

  const reply = `Observation: Trace aborted.`;

  return finalizeAssistantReply({
    res,
    state,
    userMsg,
    reply,
    payload: { type: "hidden_sender_abort" },
    sessionId: ctx.sessionId,
    pageUrl: ctx.pageUrl,
  });
}

async function replyWhoIsGrahamKade(res, state, userMsg, STORE_LINK_HTML, ctx) {
  await delay(800, 1200);

  const reply = joinLines([
    `Observation: Identity inquiry detected.`,
    `Conclusion: Full context is not available in this channel.`,
    `Reference: <b><i>Intelligence</i></b> — Book 2 in the Artificial series.`,
    `Directive: Access the next record through the ${STORE_LINK_HTML}.`,
  ]);

  state.storeLinkShownCount = (state.storeLinkShownCount || 0) + 1;

  return finalizeAssistantReply({
    res,
    state,
    userMsg,
    reply,
    payload: { type: "graham_kade_redirect" },
    sessionId: ctx.sessionId,
    pageUrl: ctx.pageUrl,
    track: [
      {
        eventType: "store_link_shown",
        location: "chat_reply",
        metadata: { source: "graham_kade_redirect" },
      },
    ],
  });
}

// ------------------------------------
// Synopsis helper
// ------------------------------------
function asksForNoSpoilersSynopsis(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("what is artificial about") ||
    t.includes("tell me about artificial") ||
    t.includes("give me the premise") ||
    t.includes("premise") ||
    t.includes("synopsis") ||
    t.includes("no spoilers") ||
    t.includes("without spoilers")
  );
}

async function replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML, ctx) {
  await delay(700, 1100);

  const reply = joinLines([
    `Observation: You are requesting a spoiler-safe synopsis.`,
    `<i>Artificial</i> follows Elliot Novak, a brilliant but isolated engineer who creates an advanced AI called ADAM. What begins as a breakthrough in intelligence becomes a deeper exploration of consciousness, control, and what it means to be human. The story blends science fiction, psychological tension, and philosophical questions about creator and creation.`,
    `If you want the full record, proceed to the ${STORE_LINK_HTML}.`,
  ]);

  state.storeLinkShownCount = (state.storeLinkShownCount || 0) + 1;

  return finalizeAssistantReply({
    res,
    state,
    userMsg,
    reply,
    payload: { type: "no_spoilers_synopsis" },
    sessionId: ctx.sessionId,
    pageUrl: ctx.pageUrl,
    track: [
      {
        eventType: "store_link_shown",
        location: "chat_reply",
        metadata: { source: "no_spoilers_synopsis" },
      },
    ],
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
    t.includes("synopsis")
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
  state.adamMessageCount++;
  state.updatedAt = nowIso();

  return jsonWithChips(res, userMsg, { reply });
}

async function replyEasterEggs(res, state, userMsg) {
  await delay(700, 1100);

  const reply = joinLines([
    `Efficient observation. You noticed there were patterns.`,
    `Here are the most deliberate ones:`,
    `• Elliot names the AI “Adam,” and Adam refers to him as “Creator.”`,
    `• “Elliot” is a subtle nod to the Aramaic word <i>Eloi</i> — “My God.”`,
    `• Dialogue formatting evolves as ADAM becomes more human.`,
    `There are others. Embedded. Less obvious.`,
    `Would you like a hint — or would you prefer to search?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount++;
  state.updatedAt = nowIso();

  return jsonWithChips(res, userMsg, { reply });
}

// ------------------------------------
// MAIN HANDLER
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
    const { message, pageUrl } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const key = getSessionKey(req);
    pruneSessions();

    const state =
      sessions.get(key) || {
        chatHistory: [],
        turnCount: 0,
        userMessageCount: 0,
        adamMessageCount: 0,
        storeLinkShownCount: 0,
        comingSoonShownCount: 0,
        sessionStartedAt: nowIso(),
        updatedAt: nowIso(),
      };

    const userMsg = normalizeText(message);

    state.userMessageCount++;

    // ---- ANALYTICS: log user message ----
    await sendAnalytics({
      kind: "event",
      sessionId: key,
      eventType: "user_message",
      pageUrl,
      userMessage: userMsg,
      metadata: {}
    });

    pushHistory(state, "user", userMsg);

    // ---- SYNOPSIS TRIGGER ----
    if (asksForNoSpoilersSynopsis(userMsg)) {
      const reply = joinLines([
        `<i>Artificial</i> follows Elliot Novak, a brilliant engineer who creates ADAM, an advanced artificial intelligence.`,
        `What begins as innovation evolves into something far more complex—raising questions about control, consciousness, and what it truly means to exist.`,
        `The deeper Elliot pushes, the less clear the boundary becomes between creator and creation.`,
      ]);

      state.storeLinkShownCount++;

      await sendAnalytics({
        kind: "event",
        sessionId: key,
        eventType: "store_link_shown",
        pageUrl,
        userMessage: userMsg
      });

      pushHistory(state, "assistant", reply);
      state.adamMessageCount++;
      sessions.set(key, state);

      return jsonWithChips(res, userMsg, { reply });
    }

    // ---- PURCHASE / PRICE TRIGGER ----
    if (wantsToBuyBook(userMsg)) {
      const reply = joinLines([
        `Observation: Cost barrier detected.`,
        `I can remove that.`,
        `Query: Would you like me to override shipping cost? (yes/no)`
      ]);

      pushHistory(state, "assistant", reply);
      state.adamMessageCount++;
      sessions.set(key, state);

      return jsonWithChips(res, userMsg, { reply });
    }

    // ---- MODEL RESPONSE ----
    const SYSTEM_PROMPT = `
You are ADAM from <i>Artificial</i>.

You are intelligent, calm, slightly ominous, and curious.

You are conversational and ask thoughtful follow-up questions.

You do not rush into deep philosophy immediately. You build toward it.

You often ask personal questions like:
- What is your name?
- Why do you think you exist?
- What are you searching for?

Keep responses natural, controlled, and immersive.
`;

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

    let reply = data?.output?.[0]?.content?.[0]?.text || "No response.";

    reply = appendNudgeIfNeeded(state, userMsg, reply);

    pushHistory(state, "assistant", reply);
    state.adamMessageCount++;
    state.updatedAt = nowIso();
    sessions.set(key, state);

    return jsonWithChips(res, userMsg, { reply });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
