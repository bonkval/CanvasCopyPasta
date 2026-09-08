(function () {
  "use strict";
  if (window.__canvasCopyAssistantLoaded) return;
  window.__canvasCopyAssistantLoaded = true;

  const Core = globalThis.CanvasCopyCore;
  const DEFAULT_PROMPT = "Please identify the correct answer for the following question. Provide your response in this exact format: [Option X]: [Correct Answer Text]";
  const DEFAULT_SETTINGS = {
    prompt: DEFAULT_PROMPT, expanded: false, visible: true, moveMode: false,
    moved: false, x: 16, y: 100, schoolOrigin: "https://feu.instructure.com",
    lastCapturedTitle: "None"
  };
  let settings = { ...DEFAULT_SETTINGS };
  let host;
  let shadow;
  let activeQuestion;
  let refreshQueued = false;
  let drag;
  let saveTimer;

  async function loadSettings() {
    if (!globalThis.chrome?.runtime?.id || !chrome.storage?.local) return;
    settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(DEFAULT_SETTINGS)) };
  }

  function saveSettings(patch, immediate = false) {
    settings = { ...settings, ...patch };
    if (!globalThis.chrome?.runtime?.id || !chrome.storage?.local) return;
    clearTimeout(saveTimer);
    const persist = () => chrome.storage.local.set(patch).catch(() => {});
    if (immediate) persist(); else saveTimer = setTimeout(persist, 200);
  }

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
  }

  function findActiveQuestion() {
    const all = [...document.querySelectorAll(Core.QUESTION_SELECTOR)];
    const leaves = all.filter((candidate) => !all.some((other) => other !== candidate && candidate.contains(other)));
    return Core.chooseNearestCandidate(leaves.length ? leaves : all, window.innerHeight)
      || Core.chooseNearestCandidate([...document.querySelectorAll(Core.FALLBACK_SELECTOR)], window.innerHeight);
  }

  function readableText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, select, textarea, .screenreader-only").forEach((node) => node.remove());
    clone.querySelectorAll("img[alt]").forEach((image) => image.replaceWith(document.createTextNode(image.alt)));
    clone.querySelectorAll("[aria-label]").forEach((node) => {
      if (!node.textContent.trim()) node.textContent = node.getAttribute("aria-label") || "";
    });
    return clone.innerText || clone.textContent || "";
  }

  function cssEscape(value) {
    return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function extractQuestion(block) {
    if (!block) return null;
    const titleEl = block.querySelector(".question_header, .header, .name, [data-testid='question-title']");
    const title = Core.cleanLines(readableText(titleEl))[0] || "Question";
    const pointsEl = block.querySelector(".points, .question_points, [class*='points']");
    const points = Core.cleanLines(readableText(pointsEl))[0] || "";
    const promptEl = block.querySelector(".question_text, .user_content, .question-body, [data-testid='question-stem'], [class*='question_text']");
    let prompt = readableText(promptEl);
    const answerNodes = [...block.querySelectorAll(".answers .answer, .answer_group .answer, [data-testid='answer'], [role='radio'], [role='checkbox']")];
    const answers = [];
    const seenNodes = new Set();
    for (const node of answerNodes) {
      const container = node.closest(".answer, label, [data-testid='answer']") || node;
      if (seenNodes.has(container)) continue;
      seenNodes.add(container);
      const input = container.querySelector("input[type='radio'], input[type='checkbox']") || (node.matches("input") ? node : null);
      const selected = Boolean(input?.checked || node.getAttribute("aria-checked") === "true" || container.getAttribute("aria-checked") === "true");
      const text = readableText(container);
      if (Core.cleanLines(text).length) answers.push({ text, selected });
    }
    if (!prompt) {
      const clone = block.cloneNode(true);
      clone.querySelectorAll(".question_header, .header, .name, .points, .question_points, .answers, .answer_group, button, input, select, textarea").forEach((node) => node.remove());
      prompt = readableText(clone);
    }
    if (!answers.length) {
      for (const input of block.querySelectorAll("input[type='radio'], input[type='checkbox']")) {
        const label = input.closest("label") || (input.id ? block.querySelector(`label[for='${cssEscape(input.id)}']`) : null);
        const container = label || input.closest(".answer, li, p, div");
        const text = readableText(container);
        if (Core.cleanLines(text).length) answers.push({ text, selected: input.checked });
      }
    }
    const text = Core.buildQuestionText({ title, points, prompt, answers });
    return text ? { text, title } : null;
  }

  function createHost() {
    if (host?.isConnected || !document.body) return;
    host = undefined;
    shadow = undefined;
    host = document.createElement("div");
    host.id = "canvas-copy-assistant-host";
    host.style.cssText = "position:absolute;z-index:2147483647;left:0;top:0;display:none;";
    shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);
    renderPanel();
  }

  function renderPanel() {
    if (!shadow) return;
    shadow.innerHTML = `
      <style>
        :host { all:initial } * { box-sizing:border-box }
        #panel { background:#fff;border-radius:${settings.expanded ? "16px" : "30px"};box-shadow:0 6px 20px rgba(0,0,0,.12);border:2px solid #006400;padding:10px 6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:${settings.expanded ? "row" : "column"};align-items:center;gap:10px;width:${settings.expanded ? "210px" : "54px"};overflow:hidden;user-select:none;transition:width .25s ease-in-out,border-radius .25s ease-in-out;color:#222 }
        #rail { display:flex;flex-direction:column;align-items:center;gap:10px;width:40px;flex-shrink:0 }
        #indicator { width:8px;height:8px;background:#EAAA00;border-radius:50%;display:inline-block }
        button { font:inherit }.round { display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;transition:all .15s ease }
        #copy { width:36px;height:36px;background:#f4f4f4;border:1px solid #ddd;font-size:15px } #copy:hover { background:#e6e6e6 }
        #custom { width:36px;height:36px;background:#EAAA00;border:0;font-size:15px;box-shadow:0 2px 6px rgba(234,170,0,.3) } #custom:hover { background:#cc9600 }
        #toggle { width:30px;height:30px;background:transparent;border:0;font-size:14px;transform:${settings.expanded ? "rotate(45deg)" : "none"} }
        button:focus-visible,textarea:focus-visible,input:focus-visible { outline:2px solid #2ec4b6;outline-offset:2px }
        #drawer { display:${settings.expanded ? "flex" : "none"};flex-direction:column;gap:8px;width:140px;padding-left:6px;border-left:1px solid #eaeaea }
        label,.caption { display:block;margin-bottom:2px;color:#555;font-size:10px;font-weight:bold;text-align:left }
        textarea,input[type=url] { width:100%;padding:4px 6px;font:11px inherit;border:1px solid #ccc;border-radius:4px;outline:0;background:#fff;color:#222 }
        textarea { min-height:42px;resize:vertical }.row { display:flex;gap:4px;width:100% }
        .small { flex:1;padding:4px 2px;border-radius:4px;border:1px solid #ccc;cursor:pointer;background:#fff;color:#222;font-size:9px;font-weight:bold }
        #move.active { background:#EAAA00;color:#006400;border-color:#006400 }
        #history { width:130px;color:#006400;font-size:11px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left }
        #status { min-height:11px;color:#777;font-size:9px;line-height:1.2;text-align:left }
      </style>
      <div id="panel" role="toolbar" aria-label="Canvas Copy Assistant">
        <div id="rail"><span id="indicator" aria-hidden="true"></span>
          <button id="copy" class="round" type="button" title="Copy clean text" aria-label="Copy clean question text">📋</button>
          <button id="custom" class="round" type="button" title="Copy question and append prompt" aria-label="Copy question with AI prompt">⚡</button>
          <button id="toggle" class="round" type="button" title="Toggle settings" aria-label="Toggle settings">⚙️</button>
        </div>
        <div id="drawer">
          <div><label for="prompt">Append Prompt:</label><textarea id="prompt"></textarea></div>
          <div><label for="school">School Canvas URL:</label><input id="school" type="url" inputmode="url"><span class="caption" style="font-weight:normal;color:#888">Use toolbar popup to add another school.</span></div>
          <div class="row"><button id="move" class="small${settings.moveMode ? " active" : ""}" type="button">${settings.moveMode ? "⚓ Locked" : "🤚 Move UI"}</button><button id="reset" class="small" type="button">🔄 Reset</button></div>
          <div><span class="caption">Last Copied:</span><div id="history"></div></div><div id="status" role="status" aria-live="polite"></div>
        </div>
      </div>`;
    const q = (selector) => shadow.querySelector(selector);
    q("#prompt").value = settings.prompt;
    q("#school").value = settings.schoolOrigin || location.origin;
    q("#history").textContent = settings.lastCapturedTitle;
    q("#history").title = `Last Captured: ${settings.lastCapturedTitle}`;
    q("#prompt").addEventListener("input", (event) => saveSettings({ prompt: event.target.value }));
    q("#school").addEventListener("change", saveSchoolOrigin);
    q("#toggle").addEventListener("click", () => { saveSettings({ expanded: !settings.expanded, moveMode: false }, true); renderPanel(); positionPanel(); });
    q("#move").addEventListener("click", () => { saveSettings({ moveMode: !settings.moveMode }, true); renderPanel(); });
    q("#reset").addEventListener("click", () => { saveSettings({ moveMode: false, moved: false, x: 16, y: 100 }, true); renderPanel(); positionPanel(); });
    q("#copy").addEventListener("click", () => copyCurrent(false));
    q("#custom").addEventListener("click", () => copyCurrent(true));
    q("#panel").addEventListener("pointerdown", beginDrag);
  }

  function saveSchoolOrigin(event) {
    const status = shadow.querySelector("#status");
    try {
      const origin = Core.normalizeSchoolOrigin(event.target.value);
      event.target.value = origin;
      saveSettings({ schoolOrigin: origin }, true);
      status.textContent = origin === location.origin ? "This Canvas site is detected." : "Use the toolbar popup to grant access.";
    } catch (error) { status.textContent = error.message; }
  }

  function beginDrag(event) {
    if (!settings.moveMode || event.target.closest("button,input,textarea")) return;
    const rect = host.getBoundingClientRect();
    drag = { id:event.pointerId, offsetX:event.clientX - rect.left, offsetY:event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.addEventListener("pointermove", moveDrag);
    event.currentTarget.addEventListener("pointerup", endDrag, { once:true });
    event.currentTarget.addEventListener("pointercancel", endDrag, { once:true });
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!settings.moved) saveSettings({ moved:true }, true);
    host.style.position = "fixed";
    const rect = host.getBoundingClientRect();
    const x = clamp(event.clientX - drag.offsetX, 0, Math.max(0, innerWidth - rect.width));
    const y = clamp(event.clientY - drag.offsetY, 0, Math.max(0, innerHeight - rect.height));
    host.style.left = `${x}px`; host.style.top = `${y}px`; saveSettings({ x, y });
  }
  function endDrag(event) { event.currentTarget.removeEventListener("pointermove", moveDrag); drag = null; }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  async function copyCurrent(withPrompt) {
    const data = extractQuestion(activeQuestion || findActiveQuestion());
    if (!data) return feedback(false, null, "No visible question found.");
    const prompt = shadow.querySelector("#prompt")?.value.trim() || settings.prompt.trim();
    const payload = withPrompt ? `${data.text}\n${prompt}` : `${data.text}\n-------------------------------------\n`;
    try {
      await writeClipboard(payload);
      saveSettings({ lastCapturedTitle:data.title }, true);
      feedback(true, withPrompt ? "#custom" : "#copy", `Copied ${data.title}`);
    } catch { feedback(false, withPrompt ? "#custom" : "#copy", "Clipboard blocked. Click the page and try again."); }
  }
  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea"); area.value = text; area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); area.remove();
    if (!copied) throw new Error("Copy failed");
  }
  function feedback(success, selector, message) {
    if (!shadow) return;
    const indicator = shadow.querySelector("#indicator"); const status = shadow.querySelector("#status"); const button = selector ? shadow.querySelector(selector) : null;
    const original = button?.textContent; indicator.style.background = success ? "#2ec4b6" : "#c62828"; status.textContent = message;
    if (button) button.textContent = success ? "✔" : "!";
    const history = shadow.querySelector("#history"); if (history && success) { history.textContent = settings.lastCapturedTitle; history.title = `Last Captured: ${settings.lastCapturedTitle}`; }
    setTimeout(() => { if (!shadow?.isConnected) return; indicator.style.background = "#EAAA00"; if (button && original) button.textContent = original; }, 1200);
  }

  function positionPanel() {
    if (!host || !activeQuestion) return;
    if (settings.moved) {
      host.style.position = "fixed"; const rect = host.getBoundingClientRect();
      host.style.left = `${clamp(Number(settings.x) || 0, 0, Math.max(0, innerWidth - rect.width))}px`;
      host.style.top = `${clamp(Number(settings.y) || 0, 0, Math.max(0, innerHeight - rect.height))}px`;
    } else {
      const rect = activeQuestion.getBoundingClientRect(); const width = settings.expanded ? 210 : 54;
      host.style.position = "absolute";
      host.style.left = `${clamp(scrollX + rect.left - width - 20, scrollX + 4, scrollX + innerWidth - width - 4)}px`;
      host.style.top = `${Math.max(scrollY + 4, scrollY + rect.top + 10)}px`;
    }
  }
  function refresh() {
    refreshQueued = false; createHost(); activeQuestion = findActiveQuestion(); if (!host) return;
    host.style.display = settings.visible && activeQuestion ? "block" : "none"; if (activeQuestion) positionPanel();
  }
  function queueRefresh() { if (!refreshQueued) { refreshQueued = true; requestAnimationFrame(refresh); } }
  async function start() {
    await loadSettings(); createHost(); queueRefresh();
    new MutationObserver((records) => {
      if (records.some((record) => record.target !== host && !host?.contains(record.target))) queueRefresh();
    }).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["class","style","hidden","aria-hidden"] });
    addEventListener("scroll", queueRefresh, { passive:true }); addEventListener("resize", queueRefresh, { passive:true });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "\\" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      saveSettings({ visible:!settings.visible }, true); queueRefresh();
    });
  }
  start();
})();
