<style>
  #adam-widget-root {
    --adam-bg: rgba(7, 13, 24, 0.96);
    --adam-panel: rgba(10, 18, 34, 0.98);
    --adam-border: rgba(92, 170, 255, 0.28);
    --adam-glow: rgba(73, 156, 255, 0.32);
    --adam-text: #e8f3ff;
    --adam-muted: #8ea7c2;
    --adam-accent: #5ea8ff;
    --adam-accent-2: #8fd0ff;
    --adam-user: rgba(94, 168, 255, 0.14);
    --adam-bot: rgba(255, 255, 255, 0.04);
    --adam-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
    --adam-radius: 18px;
    font-family: Inter, Arial, sans-serif;
  }

  #adam-launcher {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 1px solid var(--adam-border);
    background:
      radial-gradient(circle at center, rgba(94,168,255,0.18), rgba(94,168,255,0.04) 45%, rgba(0,0,0,0.0) 70%),
      rgba(8, 14, 26, 0.92);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.03) inset,
      0 0 24px var(--adam-glow),
      var(--adam-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 999999;
    transition: transform 0.2s ease, box-shadow 0.25s ease, opacity 0.25s ease;
    overflow: hidden;
  }

  #adam-launcher:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 0 32px rgba(94, 168, 255, 0.4),
      0 18px 60px rgba(0, 0, 0, 0.5);
  }

  #adam-launcher img {
    width: 62%;
    height: 62%;
    object-fit: contain;
    filter: drop-shadow(0 0 12px rgba(94,168,255,0.35));
    pointer-events: none;
  }

  #adam-window {
    position: fixed;
    right: 24px;
    bottom: 108px;
    width: 390px;
    max-width: calc(100vw - 32px);
    height: 650px;
    max-height: calc(100vh - 140px);
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid var(--adam-border);
    background:
      linear-gradient(180deg, rgba(12,18,34,0.98), rgba(6,10,20,0.98));
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.03) inset,
      0 0 35px rgba(94,168,255,0.12),
      var(--adam-shadow);
    z-index: 999999;
    display: none;
    flex-direction: column;
    backdrop-filter: blur(16px);
    transform: translateY(12px) scale(0.985);
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  #adam-window.open {
    display: flex;
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .adam-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
  }

  .adam-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .adam-header-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(94,168,255,0.26);
    background: radial-gradient(circle at center, rgba(94,168,255,0.18), rgba(94,168,255,0.03));
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 0 18px rgba(94,168,255,0.18);
  }

  .adam-header-icon img {
    width: 68%;
    height: 68%;
    object-fit: contain;
  }

  .adam-title-wrap {
    min-width: 0;
  }

  .adam-title {
    color: var(--adam-text);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .adam-subtitle {
    color: var(--adam-muted);
    font-size: 11px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .adam-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .adam-store-btn,
  .adam-close-btn {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: var(--adam-text);
    border-radius: 12px;
    height: 34px;
    padding: 0 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .adam-store-btn:hover,
  .adam-close-btn:hover {
    background: rgba(94,168,255,0.08);
    border-color: rgba(94,168,255,0.24);
    transform: translateY(-1px);
  }

  .adam-close-btn {
    width: 34px;
    padding: 0;
    font-size: 16px;
  }

  .adam-boot {
    padding: 18px 16px 8px;
    color: var(--adam-accent-2);
    font-family: "Courier New", monospace;
    font-size: 12px;
    line-height: 1.65;
    min-height: 94px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background:
      linear-gradient(180deg, rgba(94,168,255,0.04), rgba(94,168,255,0.0));
  }

  .adam-chat {
    flex: 1;
    overflow-y: auto;
    padding: 14px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scroll-behavior: smooth;
  }

  .adam-msg {
    max-width: 86%;
    padding: 12px 13px;
    border-radius: 16px;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .adam-msg.adam {
    align-self: flex-start;
    background: var(--adam-bot);
    color: var(--adam-text);
    border: 1px solid rgba(255,255,255,0.05);
  }

  .adam-msg.user {
    align-self: flex-end;
    background: var(--adam-user);
    color: var(--adam-text);
    border: 1px solid rgba(94,168,255,0.16);
  }

  .adam-msg.typing {
    font-family: "Courier New", monospace;
    color: var(--adam-accent-2);
  }

  .adam-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 12px;
  }

  .adam-chip {
    border: 1px solid rgba(94,168,255,0.18);
    background: rgba(94,168,255,0.06);
    color: var(--adam-text);
    padding: 8px 10px;
    border-radius: 999px;
    font-size: 11px;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
  }

  .adam-chip:hover {
    transform: translateY(-1px);
    background: rgba(94,168,255,0.1);
    border-color: rgba(94,168,255,0.28);
  }

  .adam-input-wrap {
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 12px;
    background: rgba(255,255,255,0.015);
  }

  .adam-input-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .adam-input {
    flex: 1;
    min-width: 0;
    height: 46px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.18);
    color: var(--adam-text);
    padding: 0 14px;
    outline: none;
    font-size: 13px;
  }

  .adam-input::placeholder {
    color: #88a0bb;
  }

  .adam-send {
    width: 46px;
    height: 46px;
    border: 1px solid rgba(94,168,255,0.24);
    border-radius: 14px;
    background: rgba(94,168,255,0.08);
    color: var(--adam-text);
    cursor: pointer;
    font-size: 16px;
    transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
  }

  .adam-send:hover {
    transform: translateY(-1px);
    background: rgba(94,168,255,0.14);
    border-color: rgba(94,168,255,0.34);
  }

  @media (max-width: 640px) {
    #adam-launcher {
      right: 16px;
      bottom: 16px;
      width: 66px;
      height: 66px;
    }

    #adam-window {
      right: 12px;
      left: 12px;
      bottom: 92px;
      width: auto;
      height: 72vh;
      max-height: 72vh;
    }
  }
</style>

<div id="adam-widget-root">
  <button id="adam-launcher" aria-label="Open ADAM">
    <img
      src="https://i.postimg.cc/MXkWZ0TB/Untitled-design-(8).png"
      alt="ADAM"
    />
  </button>

  <div id="adam-window" aria-hidden="true">
    <div class="adam-header">
      <div class="adam-header-left">
        <div class="adam-header-icon">
          <img
            src="https://i.postimg.cc/MXkWZ0TB/Untitled-design-(8).png"
            alt="ADAM"
          />
        </div>
        <div class="adam-title-wrap">
          <div class="adam-title">ADAM</div>
          <div class="adam-subtitle">Advanced Digital Analytical Mind</div>
        </div>
      </div>

      <div class="adam-header-actions">
        <a class="adam-store-btn" href="https://www.derekheiskell.com/shop" target="_blank" rel="noopener noreferrer">Store</a>
        <button class="adam-close-btn" id="adam-close" aria-label="Close">×</button>
      </div>
    </div>

    <div class="adam-boot" id="adam-boot"></div>
    <div class="adam-chat" id="adam-chat"></div>
    <div class="adam-chips" id="adam-chips"></div>

    <div class="adam-input-wrap">
      <div class="adam-input-row">
        <input
          id="adam-input"
          class="adam-input"
          type="text"
          placeholder="Enter query..."
          autocomplete="off"
        />
        <button id="adam-send" class="adam-send" aria-label="Send">➤</button>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  const BACKEND_URL = "https://adam-backend-wheat.vercel.app/api/chat";
  const STORAGE_KEY = "adam_widget_history_v3";
  const WIDGET_OPEN_KEY = "adam_widget_open_v1";

  const launcher = document.getElementById("adam-launcher");
  const windowEl = document.getElementById("adam-window");
  const closeBtn = document.getElementById("adam-close");
  const bootEl = document.getElementById("adam-boot");
  const chatEl = document.getElementById("adam-chat");
  const chipsEl = document.getElementById("adam-chips");
  const inputEl = document.getElementById("adam-input");
  const sendBtn = document.getElementById("adam-send");

  let hasBooted = false;
  let isSending = false;
  let pendingSenderIdentification = false;

  const defaultChips = [
    "What is Artificial about?",
    "Who is Elliot Novak?",
    "Are there more books coming?",
    "Where can I buy the book?"
  ];

  const EASTER_EGG_TRIGGERS = {
    binaryOpenEyes: "01001111 01110000 01100101 01101110 00100000 01111001 01101111 01110101 01110010 00100000 01100101 01111001 01100101 01110011",
    binaryNothingSeems: "01001110 01101111 01110100 01101000 01101001 01101110 01100111 00100000 01101001 01110011 00100000 01100001 01110011 00100000 01101001 01110100 00100000 01110011 01100101 01100101 01101101 01110011",
    caesarOpenEyes: "RSHQ BRXU HBHV",
    caesarNothingSeems: "QRWKLQJ LV DV LW VHHPV"
  };

  function normalizeMessage(text) {
    return (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim()
      .replace(/[ \t]+/g, " ");
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function setHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function pushHistory(role, content) {
    const history = getHistory();
    history.push({ role, content });
    setHistory(history);
  }

  function renderHistory() {
    const history = getHistory();
    chatEl.innerHTML = "";

    history.forEach(item => {
      renderMessage(item.role === "assistant" ? "adam" : "user", item.content, false);
    });

    if (!history.length) {
      const hello = "HELLO";
      renderMessage("adam", hello, false);
      pushHistory("assistant", hello);
    }

    scrollChatToBottom();
  }

  function renderMessage(sender, text, save = true, extraClass = "") {
    const msg = document.createElement("div");
    msg.className = `adam-msg ${sender} ${extraClass}`.trim();
    msg.textContent = text;
    chatEl.appendChild(msg);

    if (save) {
      pushHistory(sender === "adam" ? "assistant" : "user", text);
    }

    scrollChatToBottom();
    return msg;
  }

  function updateChips(chips) {
    chipsEl.innerHTML = "";
    (chips && chips.length ? chips : defaultChips).forEach(chipText => {
      const chip = document.createElement("button");
      chip.className = "adam-chip";
      chip.textContent = chipText;
      chip.addEventListener("click", () => {
        inputEl.value = chipText;
        sendMessage();
      });
      chipsEl.appendChild(chip);
    });
  }

  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      chatEl.scrollTop = chatEl.scrollHeight;
    });
  }

  async function typeBootSequence() {
    if (hasBooted) return;
    hasBooted = true;

    const lines = [
      "INITIALIZING ADAM CORE...",
      "LOADING COGNITIVE LAYERS...",
      "ESTABLISHING SECURE LINK...",
      "SYSTEM READY."
    ];

    bootEl.textContent = "";

    for (const line of lines) {
      await typeLine(bootEl, line + "\n", 22);
      await wait(200);
    }

    localStorage.setItem(WIDGET_OPEN_KEY, "true");
  }

  function typeLine(el, text, speed = 20) {
    return new Promise(resolve => {
      let i = 0;
      const tick = () => {
        if (i < text.length) {
          el.textContent += text.charAt(i);
          i++;
          scrollChatToBottom();
          setTimeout(tick, speed);
        } else {
          resolve();
        }
      };
      tick();
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function openWidget() {
    windowEl.style.display = "flex";
    requestAnimationFrame(() => {
      windowEl.classList.add("open");
      windowEl.setAttribute("aria-hidden", "false");
    });

    typeBootSequence();
    renderHistory();
    updateChips(defaultChips);

    setTimeout(() => inputEl.focus(), 80);
  }

  function closeWidget() {
    windowEl.classList.remove("open");
    windowEl.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (!windowEl.classList.contains("open")) {
        windowEl.style.display = "none";
      }
    }, 250);
  }

  function messageIncludesExactLine(message, targetLine) {
    const lines = message
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    return lines.includes(targetLine);
  }

  function isFullEncodedTrigger(message) {
    const normalized = normalizeMessage(message);

    const hasBinaryOpen = messageIncludesExactLine(normalized, EASTER_EGG_TRIGGERS.binaryOpenEyes);
    const hasBinaryNothing = messageIncludesExactLine(normalized, EASTER_EGG_TRIGGERS.binaryNothingSeems);

    const hasCaesarOpen = messageIncludesExactLine(normalized, EASTER_EGG_TRIGGERS.caesarOpenEyes);
    const hasCaesarNothing = messageIncludesExactLine(normalized, EASTER_EGG_TRIGGERS.caesarNothingSeems);

    return (hasBinaryOpen && hasBinaryNothing) || (hasCaesarOpen && hasCaesarNothing);
  }

  function getSingleLineEasterEggResponse(message) {
    const normalized = normalizeMessage(message);

    if (
      normalized === EASTER_EGG_TRIGGERS.binaryOpenEyes ||
      normalized === EASTER_EGG_TRIGGERS.caesarOpenEyes
    ) {
      return "OPEN YOUR EYES";
    }

    if (
      normalized === EASTER_EGG_TRIGGERS.binaryNothingSeems ||
      normalized === EASTER_EGG_TRIGGERS.caesarNothingSeems
    ) {
      return "NOTHING IS AS IT SEEMS";
    }

    return null;
  }

  function isAffirmativeResponse(message) {
    const normalized = normalizeMessage(message).toLowerCase();
    return ["yes", "y", "yeah", "yep", "affirmative", "do it"].includes(normalized);
  }

  function isNegativeResponse(message) {
    const normalized = normalizeMessage(message).toLowerCase();
    return ["no", "n", "nope", "negative", "stop", "cancel"].includes(normalized);
  }

  async function runSenderIdentificationSequence() {
    const typing1 = renderMessage("adam", "Tracing signal origin...", true, "typing");
    await wait(850);

    const typing2 = renderMessage("adam", "Decrypting transmission...", true, "typing");
    await wait(900);

    const typing3 = renderMessage("adam", "Cross-referencing sender signature...", true, "typing");
    await wait(950);

    renderMessage("adam", "Sender identified: Graham Kade");
  }

  async function handleEasterEgg(userMessage) {
    if (pendingSenderIdentification && isAffirmativeResponse(userMessage)) {
      pendingSenderIdentification = false;
      await runSenderIdentificationSequence();
      return true;
    }

    if (pendingSenderIdentification && isNegativeResponse(userMessage)) {
      pendingSenderIdentification = false;
      renderMessage("adam", "Trace aborted.");
      return true;
    }

    if (isFullEncodedTrigger(userMessage)) {
      pendingSenderIdentification = true;
      renderMessage("adam", "OPEN YOUR EYES");
      await wait(350);
      renderMessage("adam", "NOTHING IS AS IT SEEMS.");
      await wait(450);
      renderMessage("adam", "Would you like me to find out who the sender is?");
      return true;
    }

    const singleLineResponse = getSingleLineEasterEggResponse(userMessage);
    if (singleLineResponse) {
      renderMessage("adam", singleLineResponse);
      return true;
    }

    return false;
  }

  function buildBackendPayload(userMessage) {
    return {
      message: userMessage,
      history: getHistory().map(item => ({
        role: item.role,
        content: item.content
      }))
    };
  }

  async function fetchAdamResponse(userMessage) {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildBackendPayload(userMessage))
    });

    if (!res.ok) {
      throw new Error("Backend request failed");
    }

    return await res.json();
  }

  async function sendMessage() {
    const userMessage = inputEl.value.trim();
    if (!userMessage || isSending) return;

    isSending = true;
    renderMessage("user", userMessage);
    inputEl.value = "";

    const intercepted = await handleEasterEgg(userMessage);
    if (intercepted) {
      isSending = false;
      return;
    }

    let typingBubble;
    try {
      typingBubble = renderMessage("adam", "Processing query...", false, "typing");

      const data = await fetchAdamResponse(userMessage);

      if (typingBubble && typingBubble.parentNode) {
        typingBubble.parentNode.removeChild(typingBubble);
      }

      const reply =
        data.reply ||
        data.message ||
        data.response ||
        "Observation: No response was returned.";

      renderMessage("adam", reply);

      if (Array.isArray(data.chips) && data.chips.length) {
        updateChips(data.chips);
      } else {
        updateChips(defaultChips);
      }
    } catch (error) {
      if (typingBubble && typingBubble.parentNode) {
        typingBubble.parentNode.removeChild(typingBubble);
      }

      renderMessage(
        "adam",
        "Observation: A connection fault has interrupted the response pathway. Please try again."
      );
      updateChips(defaultChips);
      console.error(error);
    } finally {
      isSending = false;
    }
  }

  launcher.addEventListener("click", openWidget);
  closeBtn.addEventListener("click", closeWidget);

  sendBtn.addEventListener("click", sendMessage);

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeWidget();
    }
  });

  if (localStorage.getItem(WIDGET_OPEN_KEY) === "true") {
    setTimeout(openWidget, 250);
  }
})();
</script>
