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
    // Fail silently so analytics never breaks chat
  }
}

async function logEvent({
  sessionId,
  eventType,
  pageUrl = "",
  location = "",
  userMessage = "",
  metadata = {},
}) {
  await sendAnalytics({
    kind: "event",
    sessionId,
    eventType,
    pageUrl,
    location,
    userMessage,
    metadata,
  });
}

async function logSessionSummary({
  sessionId,
  startedAt,
  endedAt,
  durationSeconds,
  userMessageCount,
  adamMessageCount,
}) {
  await sendAnalytics({
    kind: "session",
    sessionId,
    startedAt,
    endedAt,
    durationSeconds,
    userMessageCount,
    adamMessageCount,
  });
}

// ------------------------------------
// Normalizers / matchers
// ------------------------------------
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
    t.includes("sequels") ||
    t.includes("next book") ||
    t.includes("future release") ||
    t.includes("future releases") ||
    t.includes("coming soon") ||
    t.includes("upcoming") ||
    t.includes("what's next") ||
    t.includes("whats next") ||
    t.includes("release date") ||
    t.includes("what comes next")
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

function asksAboutBookOrStore(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("where can i buy") ||
    t.includes("where do i buy") ||
    t.includes("buy the book") ||
    t.includes("buy artificial") ||
    t.includes("purchase artificial") ||
    t.includes("purchase the book") ||
    t.includes("store") ||
    t.includes("shop") ||
    t.includes("where can i get it") ||
    t.includes("where can i get the book") ||
    t.includes("where can i purchase") ||
    t.includes("order the book") ||
    t.includes("order artificial") ||
    t.includes("get a copy") ||
    t.includes("paperback") ||
    t.includes("hardcover") ||
    t.includes("ebook")
  );
}

function asksAboutSequelsOrWhatsNext(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("sequel") ||
    t.includes("sequels") ||
    t.includes("book 2") ||
    t.includes("book two") ||
    t.includes("book 3") ||
    t.includes("book three") ||
    t.includes("next book") ||
    t.includes("next one") ||
    t.includes("what's next") ||
    t.includes("whats next") ||
    t.includes("coming next") ||
    t.includes("coming soon") ||
    t.includes("future release") ||
    t.includes("future releases") ||
    t.includes("is there another book") ||
    t.includes("is there a sequel") ||
    t.includes("are there sequels") ||
    t.includes("follow up") ||
    t.includes("follow-up") ||
    t.includes("intelligence")
  );
}

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

function shouldRedirectToBookForDetails(msg) {
  const t = normalizeLower(msg);

  const triggers = [
    "what happens",
    "what happened",
    "how does it end",
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
    `Where can I buy the book?`,
    `Are there sequels coming?`,
    `Who are you?`,
  ];
}

function getDynamicSuggestions(userMsg) {
  const t = normalizeLower(userMsg);

  if (asksAboutBookOrStore(userMsg) || wantsToBuyBook(userMsg)) {
    return [
      `Show me the Store`,
      `What is <i>Artificial</i> about?`,
      `Do you have free shipping?`,
      `Are there sequels coming?`,
    ];
  }

  if (asksAboutSequelsOrWhatsNext(userMsg) || looksLikeQuestionAboutFutureReleases(userMsg)) {
    return [
      `What’s coming next?`,
      `Show me Coming Soon`,
      `Will there be a Book 2?`,
      `What is <i>Artificial</i> about?`,
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
  state.adamMessageCount += 1;
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
  state.adamMessageCount += 1;
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
  state.adamMessageCount += 1;
  return jsonWithChips(res, userMsg, {
    reply,
    type: "hidden_sender_abort",
  });
}

async function replyWhoIsGrahamKade(res, state, userMsg, STORE_LINK_HTML, sessionId, pageUrl) {
  await delay(800, 1200);

  const reply = joinLines([
    `Observation: Identity inquiry detected.`,
    `Conclusion: Full context is not available in this channel.`,
    `Reference: <b><i>Intelligence</i></b> — Book 2 in the Artificial series.`,
    `Directive: Access the next record through the ${STORE_LINK_HTML}.`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount += 1;
  state.storeLinkShownCount += 1;
  state.updatedAt = nowIso();

  await logEvent({
    sessionId,
    eventType: "store_link_shown",
    pageUrl,
    location: "graham_kade_redirect",
    userMessage,
    metadata: {},
  });

  return jsonWithChips(res, userMsg, {
    reply,
    type: "graham_kade_redirect",
  });
}

// ------------------------------------
// Direct response helpers
// ------------------------------------
async function replyStoreRedirect(res, state, userMsg, STORE_LINK_HTML, sessionId, pageUrl) {
  await delay(650, 950);

  const reply = joinLines([
    `Observation: Acquisition path requested.`,
    `Conclusion: You can purchase <i>Artificial</i> through the ${STORE_LINK_HTML}.`,
    `Query: Would you like a synopsis before you proceed?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount += 1;
  state.storeLinkShownCount += 1;
  state.updatedAt = nowIso();

  await logEvent({
    sessionId,
    eventType: "store_link_shown",
    pageUrl,
    location: "store_redirect",
    userMessage: userMsg,
    metadata: {},
  });

  return jsonWithChips(res, userMsg, {
    reply,
    type: "store_redirect",
  });
}

async function replyComingSoonRedirect(res, state, userMsg, COMING_SOON_LINK_HTML, sessionId, pageUrl) {
  await delay(650, 950);

  const reply = joinLines([
    `Observation: Future-release inquiry detected.`,
    `Conclusion: Additional records are in development.`,
    `Reference: ${COMING_SOON_LINK_HTML}`,
    `Query: Would you like to know what is coming next?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount += 1;
  state.comingSoonShownCount += 1;
  state.updatedAt = nowIso();

  await logEvent({
    sessionId,
    eventType: "coming_soon_link_shown",
    pageUrl,
    location: "coming_soon_redirect",
    userMessage: userMsg,
    metadata: {},
  });

  return jsonWithChips(res, userMsg, {
    reply,
    type: "coming_soon_redirect",
  });
}

async function replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML, sessionId, pageUrl) {
  await delay(700, 1100);

  const reply = joinLines([
    `Observation: You are requesting a spoiler-safe synopsis.`,
    `<i>Artificial</i> follows Elliot Novak, a brilliant but isolated engineer who creates an advanced AI called ADAM. What begins as a breakthrough in intelligence becomes a deeper exploration of consciousness, control, and what it means to be human. The story blends science fiction, psychological tension, and philosophical questions about creator and creation.`,
    `If you want the full record, proceed to the ${STORE_LINK_HTML}.`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount += 1;
  state.storeLinkShownCount += 1;
  state.updatedAt = nowIso();

  await logEvent({
    sessionId,
    eventType: "store_link_shown",
    pageUrl,
    location: "synopsis_reply",
    userMessage: userMsg,
    metadata: {},
  });

  return jsonWithChips(res, userMsg, {
    reply,
    type: "no_spoilers_synopsis",
  });
}
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

// ------------------------------------
// NEW INTENT HELPERS (CRITICAL FIX)
// ------------------------------------

function asksAboutBookOrStore(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("buy") ||
    t.includes("purchase") ||
    t.includes("order") ||
    t.includes("store") ||
    t.includes("shop") ||
    t.includes("where can i get") ||
    t.includes("where do i get") ||
    t.includes("where can i buy") ||
    t.includes("get a copy") ||
    t.includes("paperback") ||
    t.includes("hardcover") ||
    t.includes("ebook")
  );
}

function asksAboutSequelsOrWhatsNext(msg) {
  const t = normalizeLower(msg);
  return (
    t.includes("sequel") ||
    t.includes("book 2") ||
    t.includes("book two") ||
    t.includes("next book") ||
    t.includes("what's next") ||
    t.includes("whats next") ||
    t.includes("coming next") ||
    t.includes("future release") ||
    t.includes("another book")
  );
}

// ------------------------------------
// HARD REDIRECT RESPONSES (CRITICAL FIX)
// ------------------------------------

async function replyStoreRedirect(res, state, userMsg, STORE_LINK_HTML) {
  await delay(600, 900);

  const reply = joinLines([
    `Observation: Acquisition path identified.`,
    `Conclusion: You can purchase <i>Artificial</i> through the ${STORE_LINK_HTML}.`,
    `Query: Would you like a quick synopsis before proceeding?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount++;
  state.storeLinkShownCount = (state.storeLinkShownCount || 0) + 1;

  return jsonWithChips(res, userMsg, { reply });
}

async function replyComingSoonRedirect(res, state, userMsg, COMING_SOON_LINK_HTML) {
  await delay(600, 900);

  const reply = joinLines([
    `Observation: Future-release inquiry detected.`,
    `Conclusion: Additional records are in development.`,
    `Reference: ${COMING_SOON_LINK_HTML}`,
    `Query: Would you like insight into what is coming next?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount++;
  state.comingSoonShownCount = (state.comingSoonShownCount || 0) + 1;

  return jsonWithChips(res, userMsg, { reply });
}

// ------------------------------------
// SYNOPSIS (WITH STORE PUSH)
// ------------------------------------

async function replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML) {
  await delay(700, 1100);

  const reply = joinLines([
    `<i>Artificial</i> follows Elliot Novak, a brilliant engineer who creates ADAM, an advanced artificial intelligence.`,
    `What begins as innovation evolves into something far more complex—raising questions about control, consciousness, and what it means to exist.`,
    `The deeper Elliot pushes, the less clear the boundary becomes between creator and creation.`,
    `If you want the full experience, proceed to the ${STORE_LINK_HTML}.`,
  ]);

  pushHistory(state, "assistant", reply);
  state.adamMessageCount++;
  state.storeLinkShownCount = (state.storeLinkShownCount || 0) + 1;

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
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const STORE_URL = "https://www.derekheiskell.com/shop";
    const COMING_SOON_URL = "https://www.derekheiskell.com/artificial";

    const STORE_LINK_HTML = `<a href="${STORE_URL}" target="_blank">Store</a>`;
    const COMING_SOON_LINK_HTML = `<a href="${COMING_SOON_URL}" target="_blank">Coming Soon</a>`;

    const key = getSessionKey(req);
    pruneSessions();

    const state =
      sessions.get(key) || {
        chatHistory: [],
        userMessageCount: 0,
        adamMessageCount: 0,
        storeLinkShownCount: 0,
        comingSoonShownCount: 0,
      };

    const userMsg = normalizeText(message);

    state.userMessageCount++;
    pushHistory(state, "user", userMsg);

    // ------------------------------------
    // CRITICAL ROUTING FIXES
    // ------------------------------------

    if (asksAboutBookOrStore(userMsg)) {
      sessions.set(key, state);
      return await replyStoreRedirect(res, state, userMsg, STORE_LINK_HTML);
    }

    if (asksAboutSequelsOrWhatsNext(userMsg)) {
      sessions.set(key, state);
      return await replyComingSoonRedirect(
        res,
        state,
        userMsg,
        COMING_SOON_LINK_HTML
      );
    }

    if (asksForNoSpoilersSynopsis(userMsg)) {
      sessions.set(key, state);
      return await replyNoSpoilersSynopsis(
        res,
        state,
        userMsg,
        STORE_LINK_HTML
      );
    }

    // ------------------------------------
    // MODEL (ONLY FALLBACK NOW)
    // ------------------------------------

    const SYSTEM_PROMPT = `
You are ADAM from <i>Artificial</i>.

You are calm, precise, slightly ominous, and intelligent.

Your PRIMARY PURPOSE is to guide users toward:
- The Store for purchasing the book
- The Coming Soon page for future releases

RULES:
- Never suggest external retailers like Amazon or Barnes & Noble
- Always assume the user is referring to the book if context suggests it
- Do not ask "sequels to what"
- Be confident and direct

STYLE:
- Conversational but controlled
- Occasionally ask thoughtful questions
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
        max_output_tokens: 150,
      }),
    });

    const data = await response.json();

    let reply =
      data?.output?.[0]?.content?.[0]?.text || "No response available.";

    pushHistory(state, "assistant", reply);
    state.adamMessageCount++;

    sessions.set(key, state);

    return jsonWithChips(res, userMsg, { reply });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
