(function () {
  "use strict";
  if (window.__canvasCopyAssistantLoaded) return;
  window.__canvasCopyAssistantLoaded = true;

  const Core = globalThis.CanvasCopyCore;
  const DEFAULT_PROMPT = "Please identify the correct answer for the following question. Provide your response in this exact format: [Option X]: [Correct Answer Text]";
  const DEFAULT_SETTINGS = {
    prompt: DEFAULT_PROMPT, expanded: false, visible: true, moveMode: false,
    moved: false, x: 16, y: 100, schoolOrigin: "https://feu.instructure.com",
    lastCapturedTitle: "None", answerList: "", answerMode: false
  };
  let settings = { ...DEFAULT_SETTINGS };
  let host;
  let shadow;
  let activeQuestion;
  let refreshQueued = false;
  let drag;
  let saveTimer;
  let displayedImageCount = 0;

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
    if (element.matches?.("img, canvas")) {
      const description = Core.cleanImageDescription(element.alt);
      return description ? `[Image: ${description}]` : "[Question image]";
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, select, textarea, .screenreader-only").forEach((node) => node.remove());
    clone.querySelectorAll("img").forEach((image) => {
      const description = Core.cleanImageDescription(image.alt);
      image.replaceWith(document.createTextNode(description ? `[Image: ${description}]` : "[Question image]"));
    });
    clone.querySelectorAll("[aria-label]").forEach((node) => {
      if (!node.textContent.trim()) node.textContent = node.getAttribute("aria-label") || "";
    });
    return clone.innerText || clone.textContent || "";
  }

  function cssEscape(value) {
    return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function reviewState(element) {
    if (!element) return undefined;
    const className = typeof element.className === "string" ? element.className : "";
    const stateText = `${className} ${element.getAttribute?.("aria-label") || ""} ${element.getAttribute?.("title") || ""}`;
    if (/incorrect|wrong/i.test(stateText)) return false;
    if (/(^|[\s_-])(correct|correct_answer|right_answer)(?=$|[\s_-])/i.test(stateText)) return true;
    return undefined;
  }

  function parseQuestionResult(block) {
    const text = readableText(block);
    const scoreMatch = text.match(/(\d+(?:\.\d+)?)\s+out\s+of\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*pts?)?/i);
    const score = scoreMatch ? Number(scoreMatch[1]) : undefined;
    const max = scoreMatch ? Number(scoreMatch[3] ?? scoreMatch[2]) : undefined;
    const explicit = reviewState(block);
    return {
      score,
      max,
      correct: explicit !== undefined ? explicit : (score != null && max != null && max > 0 ? score >= max : undefined)
    };
  }

  function extractQuestion(block) {
    if (!block) return null;
    const titleEl = block.querySelector(".question_header, .header, .name, [data-testid='question-title']");
    const title = Core.cleanLines(readableText(titleEl))[0] || "Question";
    const pointsEl = block.querySelector(".points, .question_points, [class*='points']");
    const points = Core.cleanLines(readableText(pointsEl))[0] || "";
    const promptSelector = ".question_text, .user_content, .question-body, [data-testid='question-stem'], [class*='question_text']";
    const promptElements = [
      ...(block.matches?.(promptSelector) ? [block] : []),
      ...block.querySelectorAll(promptSelector)
    ];
    // Canvas can include empty/hidden user-content wrappers before the actual
    // stem. Prefer the candidate containing the most readable text.
    let prompt = promptElements
      .map((element) => readableText(element))
      .sort((left, right) => right.length - left.length)[0] || "";
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
      if (Core.cleanLines(text).length) answers.push({ text, selected, correct:reviewState(container) ?? reviewState(node) ?? reviewState(input) });
    }
    if (!prompt) {
      // Some Canvas layouts put the stem in a parent wrapper rather than in
      // one of the known stem classes. Check the active block and its nearby
      // parents while stripping only known non-stem content.
      const fallbackRoots = [block, block.parentElement, block.parentElement?.parentElement].filter(Boolean);
      const fallbackPrompts = fallbackRoots.map((root) => {
        const clone = root.cloneNode(true);
        clone.querySelectorAll(".name, .points, .question_points, .answers, .answer_group, button, input, select, textarea").forEach((node) => node.remove());
        return readableText(clone);
      });
      prompt = fallbackPrompts.sort((left, right) => right.length - left.length)[0] || "";
    }
    if (!answers.length) {
      for (const input of block.querySelectorAll("input[type='radio'], input[type='checkbox']")) {
        const label = input.closest("label") || (input.id ? block.querySelector(`label[for='${cssEscape(input.id)}']`) : null);
        const container = label || input.closest(".answer, li, p, div");
        const text = readableText(container);
        if (Core.cleanLines(text).length) answers.push({ text, selected: input.checked, correct:reviewState(container) ?? reviewState(input) });
      }
    }
    const result = parseQuestionResult(block);
    answers.forEach((answer) => {
      if (answer.correct === undefined && answer.selected && result.correct !== undefined) answer.correct = result.correct;
    });
    const text = Core.buildQuestionText({ title, points, prompt, answers });
    return text ? { text, title, points, prompt, answers, result } : null;
  }

  function findQuestionBlocks() {
    const all = [...document.querySelectorAll(Core.QUESTION_SELECTOR)];
    const leaves = all.filter((candidate) => !all.some((other) => other !== candidate && candidate.contains(other)));
    return (leaves.length ? leaves : all).sort((left, right) => {
      if (left === right) return 0;
      return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function imageDescription(element, index) {
    return Core.cleanImageDescription(element.alt);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not prepare an image for the clipboard."));
      reader.readAsDataURL(blob);
    });
  }

  async function collectAllQuestions() {
    const records = [];
    for (const block of findQuestionBlocks()) {
      const record = extractQuestion(block);
      if (!record) continue;
      record.images = [];
      const imageElements = collectQuestionImages(block);
      for (const [index, element] of imageElements.entries()) {
        const image = { alt:imageDescription(element, index), dataUrl:"" };
        try { image.dataUrl = await blobToDataUrl(await imageBlob(element)); } catch { /* Keep the text placeholder if an image cannot be read. */ }
        record.images.push(image);
      }
      records.push(record);
    }
    return records;
  }

  function buildReviewExport(records) {
    const numbered = records.map((record, index) => ({ ...record, title:`Question ${index + 1}` }));
    const text = ["Canvas quiz review", ...numbered.map((record) => Core.buildReviewText(record))]
      .join("\n\n-------------------------------------\n\n");
    const body = numbered.map((record) => Core.buildReviewHtml(record)).join("\n");
    const html = `<!doctype html><meta charset="utf-8"><title>Canvas quiz review</title><style>body{font:16px Arial,sans-serif;line-height:1.45;color:#172b4d;max-width:900px;margin:32px auto;padding:0 20px}article{border:1px solid #ccd3da;border-radius:8px;padding:20px;margin:0 0 20px}h2{margin-top:0}figure{margin:14px 0}figure img{display:block;max-width:100%;height:auto}figcaption{color:#5e6c84;font-size:13px;margin-top:4px}.answers p{margin:7px 0}</style>${body}`;
    return { text, html };
  }

  function collectQuestionImages(block) {
    if (!block) return [];
    return [...block.querySelectorAll("img, canvas")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const width = element.naturalWidth || element.width || rect.width;
      const height = element.naturalHeight || element.height || rect.height;
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && width >= 40 && height >= 40
        && style.display !== "none" && style.visibility !== "hidden"
        && element.getAttribute("aria-hidden") !== "true";
    });
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
        #panel { background:#fff;border-radius:${settings.expanded || settings.answerMode ? "16px" : "30px"};box-shadow:0 6px 20px rgba(0,0,0,.12);border:2px solid #006400;padding:10px 6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:${settings.expanded || settings.answerMode ? "row" : "column"};align-items:center;gap:10px;width:${settings.answerMode ? "310px" : settings.expanded ? "210px" : "54px"};overflow:hidden;user-select:none;transition:width .25s ease-in-out,border-radius .25s ease-in-out;color:#222 }
        #rail { display:flex;flex-direction:column;align-items:center;gap:10px;width:40px;flex-shrink:0 }
        #indicator { width:8px;height:8px;background:#EAAA00;border-radius:50%;display:inline-block }
        button { font:inherit }.round { display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;transition:all .15s ease }
        #copy { width:36px;height:36px;background:#f4f4f4;border:1px solid #ddd;font-size:15px } #copy:hover { background:#e6e6e6 }
        #custom { width:36px;height:36px;background:#EAAA00;border:0;font-size:15px;box-shadow:0 2px 6px rgba(234,170,0,.3) } #custom:hover { background:#cc9600 }
        #answers { width:36px;height:36px;background:#eef8ee;border:1px solid #006400;color:#006400;font-size:13px } #answers:hover { background:#dff0df }
        #image { width:36px;height:36px;background:#f4f4f4;border:1px solid #ddd;font-size:15px } #image:hover { background:#e6e6e6 }
        #toggle { width:30px;height:30px;background:transparent;border:0;font-size:14px;transform:${settings.expanded ? "rotate(45deg)" : "none"} }
        button:focus-visible,textarea:focus-visible,input:focus-visible { outline:2px solid #2ec4b6;outline-offset:2px }
        #drawer { display:${settings.expanded || settings.answerMode ? "flex" : "none"};flex-direction:column;gap:8px;width:${settings.answerMode ? "240px" : "140px"};padding-left:6px;border-left:1px solid #eaeaea }
        label,.caption { display:block;margin-bottom:2px;color:#555;font-size:10px;font-weight:bold;text-align:left }
        textarea,input[type=url] { width:100%;padding:4px 6px;font:11px inherit;border:1px solid #ccc;border-radius:4px;outline:0;background:#fff;color:#222 }
        textarea { min-height:42px;resize:vertical }.row { display:flex;gap:4px;width:100% }
        .small { flex:1;padding:4px 2px;border-radius:4px;border:1px solid #ccc;cursor:pointer;background:#fff;color:#222;font-size:9px;font-weight:bold }
        #move.active { background:#EAAA00;color:#006400;border-color:#006400 }
        #history { width:130px;color:#006400;font-size:11px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left }
        #all { width:100%;border-color:#006400;background:#eef8ee;color:#006400;font-size:10px }
        #answer-list { min-height:180px;line-height:1.35;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px }
        #answer-status { min-height:20px;color:#006400;font-size:10px;line-height:1.3;text-align:left }
        #answer-status.error { color:#b42318 }
        .answer-help { color:#777;font-size:10px;line-height:1.35 }
        #status { min-height:11px;color:#777;font-size:9px;line-height:1.2;text-align:left }
      </style>
      <div id="panel" role="toolbar" aria-label="Canvas Copy Assistant">
        <div id="rail"><span id="indicator" aria-hidden="true"></span>
          <button id="copy" class="round" type="button" title="Copy clean text" aria-label="Copy clean question text">📋</button>
          <button id="custom" class="round" type="button" title="Copy question and append prompt" aria-label="Copy question with AI prompt">⚡</button>
          <button id="answers" class="round" type="button" title="Enter and apply your answer list" aria-label="Open answer list">A</button>
          ${displayedImageCount ? `<button id="image" class="round" type="button" title="Copy ${displayedImageCount === 1 ? "question image" : `${displayedImageCount} question images as one PNG`}" aria-label="Copy question image">🖼️</button>` : ""}
          <button id="toggle" class="round" type="button" title="Toggle settings" aria-label="Toggle settings">⚙️</button>
        </div>
        <div id="drawer">
          <div id="answer-drawer" style="display:${settings.answerMode ? "block" : "none"}">
            <div><label for="answer-list">Answer list:</label><textarea id="answer-list" placeholder="1. True\n2. Mac address\n3. text: 192.168.1.1\n4. Option A | Option C"></textarea><div class="answer-help">One answer per line. Choices are automatic. Use <code>text:</code> for a text box and <code>|</code> or <code>;</code> between checkbox answers.</div></div>
            <div class="row"><button id="preview-answers" class="small" type="button">Preview</button><button id="apply-answers" class="small" type="button">Apply answers</button></div>
            <div id="answer-status" role="status" aria-live="polite"></div>
          </div>
          <div id="settings-drawer" style="display:${settings.answerMode ? "none" : "block"}">
          <div><label for="prompt">Append Prompt:</label><textarea id="prompt"></textarea></div>
          <div><label for="school">School Canvas URL:</label><input id="school" type="url" inputmode="url"><span class="caption" style="font-weight:normal;color:#888">Use toolbar popup to add another school.</span></div>
          <button id="all" class="small" type="button" title="Copy every question with selected answers, review results, and images">Copy all reviewed questions</button>
          <div class="row"><button id="move" class="small${settings.moveMode ? " active" : ""}" type="button">${settings.moveMode ? "⚓ Locked" : "🤚 Move UI"}</button><button id="reset" class="small" type="button">🔄 Reset</button></div>
          <div><span class="caption">Last Copied:</span><div id="history"></div></div><div id="status" role="status" aria-live="polite"></div>
          </div>
        </div>
      </div>`;
    const q = (selector) => shadow.querySelector(selector);
    const prompt = q("#prompt");
    const school = q("#school");
    const answerList = q("#answer-list");
    if (prompt) prompt.value = settings.prompt;
    if (school) school.value = settings.schoolOrigin || location.origin;
    if (answerList) answerList.value = settings.answerList;
    q("#history").textContent = settings.lastCapturedTitle;
    q("#history").title = `Last Captured: ${settings.lastCapturedTitle}`;
    prompt?.addEventListener("input", (event) => saveSettings({ prompt: event.target.value }));
    school?.addEventListener("change", saveSchoolOrigin);
    answerList?.addEventListener("input", (event) => saveSettings({ answerList:event.target.value }));
    q("#toggle").addEventListener("click", () => { saveSettings({ expanded: !settings.expanded, answerMode:false, moveMode: false }, true); renderPanel(); positionPanel(); });
    q("#answers").addEventListener("click", () => { saveSettings({ answerMode: !settings.answerMode, expanded:false, moveMode:false }, true); renderPanel(); positionPanel(); });
    q("#preview-answers")?.addEventListener("click", previewAnswers);
    q("#apply-answers")?.addEventListener("click", applyAnswers);
    q("#move")?.addEventListener("click", () => { saveSettings({ moveMode: !settings.moveMode }, true); renderPanel(); });
    q("#reset")?.addEventListener("click", () => { saveSettings({ moveMode: false, moved: false, x: 16, y: 100 }, true); renderPanel(); positionPanel(); });
    q("#copy").addEventListener("click", () => copyCurrent(false));
    q("#custom").addEventListener("click", () => copyCurrent(true));
    q("#image")?.addEventListener("click", copyQuestionImages);
    q("#all")?.addEventListener("click", copyAllQuestions);
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

  function parseAnswerList(value) {
    const lines = String(value || "").split(/\r?\n/);
    const entries = [];
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      const match = line.match(/^(?:question\s*)?(\d+)\s*[.)\-:]\s*(.+)$/i) || line.match(/^(\d+)\s+(.+)$/);
      if (!match) throw new Error(`Use one answer per line, for example: 1. True`);
      let answer = match[2].trim();
      let kind = "choice";
      if (/^text\s*:/i.test(answer)) { kind = "text"; answer = answer.replace(/^text\s*:/i, "").trim(); }
      else if (/^choice\s*:/i.test(answer)) answer = answer.replace(/^choice\s*:/i, "").trim();
      answer = answer.replace(/^is\s+/i, "");
      if (!answer) throw new Error(`Question ${match[1]} has an empty answer.`);
      if (entries.some((entry) => entry.number === Number(match[1]))) throw new Error(`Question ${match[1]} is listed more than once.`);
      entries.push({ number:Number(match[1]), answer, kind });
    }
    return entries;
  }

  function normalizeAnswer(value) {
    return Core.cleanAnswerText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function isCheckboxChoice(choice) {
    return choice.input?.type === "checkbox"
      || choice.container.getAttribute("role") === "checkbox"
      || Boolean(choice.container.querySelector("[role='checkbox']"));
  }

  function isChoiceSelected(choice) {
    return Boolean(choice.input?.checked
      || choice.container.getAttribute("aria-checked") === "true"
      || choice.container.querySelector("[aria-checked='true']"));
  }

  function isChoiceDisabled(choice) {
    return Boolean(choice.input?.disabled
      || choice.container.getAttribute("aria-disabled") === "true"
      || choice.container.querySelector("[aria-disabled='true']"));
  }

  function choiceCandidates(block) {
    const nodes = [...block.querySelectorAll(".answers .answer, .answer_group .answer, [data-testid='answer'], [role='radio'], [role='checkbox']")];
    const candidates = [];
    const seen = new Set();
    for (const node of nodes) {
      const container = node.closest(".answer, label, [data-testid='answer']") || node;
      if (seen.has(container)) continue;
      seen.add(container);
      const input = container.querySelector("input[type='radio'], input[type='checkbox']") || (node.matches("input") ? node : null);
      const text = Core.cleanAnswerText(readableText(container));
      if (text) candidates.push({ container, input, text });
    }
    return candidates;
  }

  function textFields(block) {
    return [...block.querySelectorAll("textarea, input:not([type='radio']):not([type='checkbox']):not([type='hidden']), [contenteditable='true'], [role='textbox']")]
      .filter((field) => !field.disabled && field.getAttribute("aria-hidden") !== "true");
  }

  function resolveAnswerPlan(entries) {
    const blocks = findQuestionBlocks();
    const plan = [];
    const issues = [];
    for (const entry of entries) {
      const block = blocks[entry.number - 1];
      if (!block) { issues.push(`Question ${entry.number} was not found.`); continue; }
      const choices = choiceCandidates(block);
      const fields = textFields(block);
      if (entry.kind === "text" || (!choices.length && fields.length)) {
        if (fields.length !== 1) {
          issues.push(`Question ${entry.number} needs exactly one text field; found ${fields.length}.`);
          continue;
        }
        plan.push({ entry, mode:"text", target:fields[0], label:`Question ${entry.number} → text box` });
        continue;
      }
      const multipleAnswer = choices.some(isCheckboxChoice);
      const requested = entry.answer.split(/\s*(?:\||;)\s*/).map((answer) => answer.trim()).filter(Boolean);
      if (!multipleAnswer && requested.length > 1) {
        issues.push(`Question ${entry.number} accepts one choice, but multiple answers were provided.`);
        continue;
      }
      const targets = requested.map((answer) => {
        const wanted = normalizeAnswer(answer);
        return choices.filter((choice) => normalizeAnswer(choice.text) === wanted);
      });
      const missingIndex = targets.findIndex((matches) => matches.length !== 1);
      if (missingIndex !== -1) {
        const answer = requested[missingIndex];
        issues.push(targets[missingIndex].length > 1
          ? `Question ${entry.number} has multiple choices matching “${answer}”.`
          : `Question ${entry.number} has no choice matching “${answer}”.`);
        continue;
      }
      const selectedTargets = targets.map((matches) => matches[0]);
      if (selectedTargets.some(isChoiceDisabled)) {
        issues.push(`Question ${entry.number} has a disabled answer control.`);
        continue;
      }
      if (multipleAnswer) {
        const desired = new Set(selectedTargets);
        plan.push({ entry, mode:"choices", targets:choices, desired, label:`Question ${entry.number} → ${requested.join(" + ")}` });
      } else {
        plan.push({ entry, mode:"choice", target:selectedTargets[0], label:`Question ${entry.number} → ${selectedTargets[0].text}` });
      }
    }
    return { plan, issues };
  }

  function answerStatus(message, error = false) {
    const status = shadow.querySelector("#answer-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function readAnswerPlan() {
    try {
      const entries = parseAnswerList(shadow.querySelector("#answer-list")?.value || settings.answerList);
      const resolved = resolveAnswerPlan(entries);
      return { ...resolved, entries };
    } catch (error) {
      return { plan:[], issues:[error.message], entries:[] };
    }
  }

  function previewAnswers() {
    const { plan, issues, entries } = readAnswerPlan();
    if (!entries.length) return answerStatus("Enter answers first, one per line.", true);
    if (issues.length) return answerStatus(`No changes made. ${issues.slice(0, 2).join(" ")}`, true);
    answerStatus(`Ready to apply ${plan.length} answer${plan.length === 1 ? "" : "s"}. Nothing has been changed yet.`);
  }

  function setTextField(field, value) {
    field.scrollIntoView({ block:"center", behavior:"smooth" });
    field.focus();
    if (field.matches("[contenteditable='true'], [role='textbox']") && !("value" in field)) field.textContent = value;
    else {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(field, value); else field.value = value;
    }
    field.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data:value }));
    field.dispatchEvent(new Event("change", { bubbles:true }));
  }

  async function applyAnswers() {
    const { plan, issues, entries } = readAnswerPlan();
    if (!entries.length) return answerStatus("Enter answers first, one per line.", true);
    if (issues.length) return answerStatus(`No changes made. ${issues.slice(0, 2).join(" ")}`, true);
    const button = shadow.querySelector("#apply-answers");
    if (button) button.disabled = true;
    try {
      for (const item of plan) {
        if (item.mode === "text") setTextField(item.target, item.entry.answer);
        else if (item.mode === "choices") {
          item.targets[0].container.scrollIntoView({ block:"center", behavior:"smooth" });
          for (const choice of item.targets) {
            const shouldSelect = item.desired.has(choice);
            if (shouldSelect === isChoiceSelected(choice)) continue;
            (choice.input || choice.container).click();
          }
        } else {
          item.target.container.scrollIntoView({ block:"center", behavior:"smooth" });
          const control = item.target.input || item.target.container;
          const selected = isChoiceSelected(item.target);
          if (!selected) control.click();
        }
      }
      answerStatus(`Applied ${plan.length} answer${plan.length === 1 ? "" : "s"}. Review them before submitting.`);
    } finally {
      if (button) button.disabled = false;
    }
  }

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

  async function copyAllQuestions() {
    const button = shadow.querySelector("#all");
    if (button) button.disabled = true;
    const status = shadow.querySelector("#status");
    if (status) status.textContent = "Reading all questions and images…";
    try {
      const records = await collectAllQuestions();
      if (!records.length) return feedback(false, "#all", "No questions found on this page.");
      const exportData = buildReviewExport(records);
      const richClipboard = await writeClipboardBundle(exportData.text, exportData.html);
      const imageCount = records.reduce((sum, record) => sum + record.images.filter((image) => image.dataUrl).length, 0);
      const message = richClipboard
        ? `Copied ${records.length} questions with ${imageCount} organized images.`
        : `Copied ${records.length} questions as text. Rich image copy is unavailable here.`;
      saveSettings({ lastCapturedTitle:`All ${records.length} questions` }, true);
      feedback(true, "#all", message);
    } catch (error) {
      feedback(false, "#all", error?.message || "Could not copy all questions.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function writeClipboardBundle(text, html) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const item = new ClipboardItem({
          "text/plain":new Blob([text], { type:"text/plain" }),
          "text/html":new Blob([html], { type:"text/html" })
        });
        await navigator.clipboard.write([item]);
        return true;
      } catch { /* Large or unsupported rich clipboard payloads still get a text export. */ }
    }
    await writeClipboard(text);
    return false;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea"); area.value = text; area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); area.remove();
    if (!copied) throw new Error("Copy failed");
  }

  async function copyQuestionImages() {
    const images = collectQuestionImages(activeQuestion || findActiveQuestion());
    if (!images.length) return feedback(false, "#image", "No question image found.");
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      return feedback(false, "#image", "This browser cannot copy images. Update the browser and try again.");
    }
    try {
      const pngPromise = createCombinedPng(images);
      await navigator.clipboard.write([new ClipboardItem({ "image/png":pngPromise }, { presentationStyle:"attachment" })]);
      const message = images.length === 1 ? "Question image copied. Paste it, then copy the text." : `${images.length} images copied as one PNG. Paste it, then copy the text.`;
      feedback(true, "#image", message);
    } catch (error) {
      feedback(false, "#image", error?.message || "The question image could not be copied.");
    }
  }

  async function createCombinedPng(elements) {
    const bitmaps = [];
    try {
      for (const element of elements) bitmaps.push(await createImageBitmap(await imageBlob(element)));
      const maxWidth = 1600;
      const maxHeight = 4096;
      const gap = bitmaps.length > 1 ? 16 : 0;
      let sizes = bitmaps.map((bitmap) => {
        const scale = Math.min(1, maxWidth / bitmap.width);
        return { width:Math.max(1, Math.round(bitmap.width * scale)), height:Math.max(1, Math.round(bitmap.height * scale)) };
      });
      const initialHeight = sizes.reduce((sum, size) => sum + size.height, 0) + gap * (sizes.length - 1);
      if (initialHeight > maxHeight) {
        const scale = maxHeight / initialHeight;
        sizes = sizes.map((size) => ({ width:Math.max(1, Math.round(size.width * scale)), height:Math.max(1, Math.round(size.height * scale)) }));
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(...sizes.map((size) => size.width));
      canvas.height = sizes.reduce((sum, size) => sum + size.height, 0) + gap * (sizes.length - 1);
      const context = canvas.getContext("2d", { alpha:false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      bitmaps.forEach((bitmap, index) => {
        const size = sizes[index];
        context.drawImage(bitmap, Math.round((canvas.width - size.width) / 2), y, size.width, size.height);
        y += size.height + gap;
      });
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create a PNG.")), "image/png"));
    } finally { bitmaps.forEach((bitmap) => bitmap.close()); }
  }

  async function imageBlob(element) {
    if (element instanceof HTMLCanvasElement) {
      return new Promise((resolve, reject) => element.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas image is protected.")), "image/png"));
    }
    const url = element.currentSrc || element.src;
    if (!url) throw new Error("The question image has no usable address.");
    try {
      const response = await fetch(url, { credentials:"include" });
      if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
      return response.blob();
    } catch (pageError) {
      const response = await chrome.runtime.sendMessage({ type:"fetch-image", url });
      if (!response?.ok) throw new Error(response?.error || pageError.message || "Image access was blocked.");
      return fetch(response.dataUrl).then((result) => result.blob());
    }
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
      const rect = activeQuestion.getBoundingClientRect(); const width = settings.answerMode ? 310 : settings.expanded ? 210 : 54;
      host.style.position = "absolute";
      host.style.left = `${clamp(scrollX + rect.left - width - 20, scrollX + 4, scrollX + innerWidth - width - 4)}px`;
      host.style.top = `${Math.max(scrollY + 4, scrollY + rect.top + 10)}px`;
    }
  }
  function refresh() {
    refreshQueued = false; createHost(); activeQuestion = findActiveQuestion(); if (!host) return;
    const imageCount = collectQuestionImages(activeQuestion).length;
    if (imageCount !== displayedImageCount) { displayedImageCount = imageCount; renderPanel(); }
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
