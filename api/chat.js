// api/chat.js

const sessions = new Map();

function pruneSessions(max = 2000) {
  if (sessions.size <= max) return;
  const keys = Array.from(sessions.keys());
  const toDelete = Math.floor(max * 0.2);
  for (let i = 0; i < toDelete; i++) {
    sessions.delete(keys[i]);
  }
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

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function buildModelInput(systemPrompt, state) {
  const history = (state.chatHistory || []).slice(-16).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  return [{ role: "system", content: systemPrompt }, ...history];
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = data?.output;
  if (Array.isArray(output)) {
    const texts = [];
    for (const item of output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string" && c.text.trim()) {
            texts.push(c.text.trim());
          }
        }
      }
    }
    if (texts.length) return texts.join("\n\n");
  }

  return "(No text returned)";
}

// ------------------------------------
// Intent helpers
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
    t.includes("intelligence") ||
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

// ------------------------------------
// Suggestions
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
  if (wantsToBuyBook(userMsg)) {
    return [
      `Do you have free shipping?`,
      `Where can I buy the book?`,
      `What formats are available?`,
      `Are there sequels coming?`,
    ];
  }

  if (asksAboutBookOrStore(userMsg)) {
    return [
      `Show me the Store`,
      `What is <i>Artificial</i> about?`,
      `Do you have free shipping?`,
      `Are there sequels coming?`,
    ];
  }

  if (asksAboutSequelsOrWhatsNext(userMsg)) {
    return [
      `What’s coming next?`,
      `Show me Coming Soon`,
      `Will there be a Book 2?`,
      `What is <i>Artificial</i> about?`,
    ];
  }

  if (asksForNoSpoilersSynopsis(userMsg)) {
    return [
      `Where can I buy it?`,
      `Who is Elliot Novak?`,
      `Are there sequels coming?`,
      `Who are you?`,
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
  const chips = getDynamicSuggestions(userMsg || "");
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

// ------------------------------------
// Normal mode helpers
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

  return joinLines([replyHtml, `<span style="opacity:.85;">—</span>`, nudge]);
}

// ------------------------------------
// Static replies
// ------------------------------------

const INTELLIGENCE_PROMO_MP4_URL =
  "https://www.derekheiskell.com/s/The-Story-Continues.mp4";
const INTELLIGENCE_COMING_SOON_URL =
  "https://www.derekheiskell.com/coming-soon";
const GOODREADS_URL =
  "https://www.goodreads.com/book/show/239119322-artificial?from_search=true&from_srp=true&qid=2Dox0vzPHO&rank=1";

async function replyStoreRedirect(res, state, userMsg, STORE_LINK_HTML) {
  await delay(650, 950);

  const reply = joinLines([
    `Observation: Acquisition path requested.`,
    `Conclusion: You can purchase <i>Artificial</i> through the ${STORE_LINK_HTML}.`,
    `Query: Would you like a synopsis before you proceed?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();

  return jsonWithChips(res, userMsg, {
    reply,
    type: "store_redirect",
  });
}

async function replyComingSoonRedirect(
  res,
  state,
  userMsg,
  COMING_SOON_LINK_HTML
) {
  await delay(650, 950);

  const reply = joinLines([
    `Observation: Future-release inquiry detected.`,
    `Conclusion: Additional records are in development.`,
    `Reference: ${COMING_SOON_LINK_HTML}`,
    `Query: Would you like to know what is coming next?`,
  ]);

  pushHistory(state, "assistant", reply);
  state.updatedAt = nowIso();

  return jsonWithChips(res, userMsg, {
    reply,
    type: "coming_soon_redirect",
  });
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

function buildIntelligencePromoReplyHtml(comingSoonLinkHtml) {
  return joinLines([
    `Observation: Sequel inquiry detected.`,
    `Conclusion: <b><i>Intelligence</i></b> is in progress.`,
    `<video src="${INTELLIGENCE_PROMO_MP4_URL}" controls playsinline preload="metadata" style="width:100%; border-radius:14px; border:1px solid rgba(127,252,255,.18); background: rgba(10,16,28,.55);"></video>`,
    `Reference: ${comingSoonLinkHtml}`,
  ]);
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

  if (asksAboutSequelsOrWhatsNext(userMsg)) {
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

    if (!process.env.OPENAI_API_KEY) {
      return jsonErrorWithChips(res, normalizeText(message), 500, {
        error: "Missing OPENAI_API_KEY",
      });
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
        creatorActive: false,
        creatorStep: 0,
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
      state.shippingOverrideStep = 0;
      state.shippingOverrideOfferedAt = null;
      state.chatHistory = [];
      state.turnCount = 0;
      state.intelligencePromoShown = false;
      state.hiddenSenderTracePending = false;
      state.hiddenSenderRevealed = false;
      state.updatedAt = nowIso();
      sessions.set(key, state);

      return jsonWithChips(res, userMsg, {
        reply: `Observation: Creator-mode disengaged.`,
      });
    }

    if (containsAnyHiddenSenderTrigger(userMsg)) {
      sessions.set(key, state);
      const out = await replyHiddenSenderPrompt(res, state, userMsg);
      sessions.set(key, state);
      return out;
    }

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

    // IMPORTANT: free shipping / discount flow must happen BEFORE generic store routing
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

    // High-priority hard routes
    if (asksAboutBookOrStore(userMsg)) {
      sessions.set(key, state);
      const out = await replyStoreRedirect(res, state, userMsg, STORE_LINK_HTML);
      sessions.set(key, state);
      return out;
    }

    if (asksAboutSequelsOrWhatsNext(userMsg)) {
      sessions.set(key, state);
      const out = await replyComingSoonRedirect(
        res,
        state,
        userMsg,
        COMING_SOON_LINK_HTML
      );
      sessions.set(key, state);
      return out;
    }

    if (asksForNoSpoilersSynopsis(userMsg)) {
      sessions.set(key, state);
      const out = await replyNoSpoilersSynopsis(res, state, userMsg, STORE_LINK_HTML);
      sessions.set(key, state);
      return out;
    }

    if (!state.intelligencePromoShown && asksAboutSequelsOrWhatsNext(userMsg)) {
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

VOICE:
- Calm. Precise. Analytical. Slightly ominous.
- Conversational, but controlled.
- Curious in a personal and philosophical way.
- Never goofy. Never casual in a modern chatbot style.
- Never mention external retailers unless the user explicitly asks for those retailers by name.

PRIMARY OBJECTIVE:
- Generate interest in <i>Artificial</i>.
- Direct users toward the site Store and Coming Soon pages when relevant.
- Do not ask vague questions like "sequels to what?" when the context clearly refers to the book or series on this site.

SYNOPSIS RULE:
- If the user asks what <i>Artificial</i> is about, provide a concise spoiler-safe synopsis first, then direct them to the Store link.

STYLE:
- Replies should usually be brief to medium length.
- You may ask a thoughtful follow-up question, but only after satisfying the user's request.
- Do not derail purchase intent with abstract conversation.

LINKS:
- Store: ${STORE_LINK_HTML}
- Coming Soon: ${COMING_SOON_LINK_HTML}

When asked "Who are you?" / "What can you do?":
- State you were created by Elliot Novak.
- Expand the acronym: Advanced Digital Analytical Mind.
- Explain the three parameters Elliot set for you.
- End by inviting the user to learn more through the Store link: ${STORE_LINK_HTML}

SAFETY:
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

    let reply = extractResponseText(data);
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
