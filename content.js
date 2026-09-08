<<<<<<< HEAD
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
=======
(function() {
  'use strict';

  if (window.top !== window.self) return; 
  if (window.hasHarvesterRun) return; 
  window.hasHarvesterRun = true;

  let lastCapturedTitle = "None";
  let isExpanded = false;     // Tracks settings drawer state
  let isMoveMode = false;     // Tracks drag unlock state
  let hasBeenMoved = false;   // Flag to check if user manually relocated UI
  let isUiVisible = true;     // Tracks whether the UI is toggled on/off globally

  // Tracking mouse coordinate offsets for dragging calculations
  let customX = 0;
  let customY = 0;

  // Listen for the Backslash (\) key globally to toggle UI visibility
  document.addEventListener("keydown", function(e) {
      if (e.key === "\\") {
          // Ignore toggle if user is currently typing inside the prompt edit box
          if (document.activeElement && document.activeElement.id === "harvester-append-text") {
              return;
          }
          
          isUiVisible = !isUiVisible;
          let panel = document.getElementById("canvas-harvester-panel");
          if (panel) {
              panel.style.display = isUiVisible ? "flex" : "none";
          }
      }
  });

  function injectDashboard() {
      // If the UI is hidden by the user, skip rendering/display modifications entirely
      if (!isUiVisible) {
          let panel = document.getElementById("canvas-harvester-panel");
          if (panel) panel.style.display = "none";
          return;
      }

      let questionBlocks = document.querySelectorAll(".quiz_question, .question, .question_holder, .display_question");
      let activeBlock = null;

      for (let block of questionBlocks) {
          if (block.offsetWidth > 0 && block.offsetHeight > 0) {
              activeBlock = block;
              break; 
          }
      }

      if (!activeBlock) {
          activeBlock = document.querySelector("#submit_quiz_form, #questions");
      }

      if (!activeBlock) {
          let oldPanel = document.getElementById("canvas-harvester-panel");
          if (oldPanel) oldPanel.style.display = "none";
          return;
      }

      let panel = document.getElementById("canvas-harvester-panel");
      
      if (!panel) {
          panel = document.createElement("div");
          panel.id = "canvas-harvester-panel";
          
          panel.style.cssText = `
              position: absolute !important;
              z-index: 9999999 !important;
              background: #ffffff !important;
              border-radius: 30px !important;
              box-shadow: 0px 6px 20px rgba(0,0,0,0.12) !important;
              border: 2px solid #006400 !important;
              padding: 10px 6px !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 10px !important;
              transition: width 0.25s ease-in-out, border-radius 0.25s ease-in-out !important;
              width: 54px !important;
              overflow: hidden !important;
              user-select: none !important;
          `;

          panel.dataset.savedPrompt = "Final answer only";
          document.body.appendChild(panel);
          
          // Setup Drag and Drop Listeners
          setupDragAndDrop(panel);
          renderPanelContents(panel);
      }

      // Positioning Logic: Only follow the question block if user hasn't drug it somewhere else
      if (!hasBeenMoved) {
          let rect = activeBlock.getBoundingClientRect();
          panel.style.top = `${window.scrollY + rect.top + 10}px`;
          panel.style.left = `${window.scrollX + rect.left - 75}px`;
      } else {
          // Keep it pinned precisely where the user dropped it
          panel.style.top = `${customY}px`;
          panel.style.left = `${customX}px`;
      }

      panel.style.display = "flex";

      let historyTracker = document.getElementById("harvester-history");
      if (historyTracker && historyTracker.innerText !== lastCapturedTitle) {
          historyTracker.innerText = lastCapturedTitle;
      }
  }

  function renderPanelContents(panel) {
      let savedPrompt = panel.dataset.savedPrompt || "Final answer only";

      panel.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; width: 40px; flex-shrink: 0;">
              <span id="harvester-indicator" style="width: 8px !important; height: 8px !important; background-color: #EAAA00 !important; border-radius: 50% !important; display: inline-block !important;"></span>
              
              <button id="harvester-copy-btn" title="Copy Clean (Docs/Notepad)" style="
                  width: 36px !important; height: 36px !important; background: #f4f4f4 !important;
                  border: 1px solid #dddddd !important; border-radius: 50% !important; cursor: pointer !important;
                  display: flex !important; align-items: center !important; justify-content: center !important; font-size: 15px !important; transition: all 0.15s ease !important;
              ">📋</button>

              <button id="harvester-custom-btn" title="Copy + Append (For Sidebar)" style="
                  width: 36px !important; height: 36px !important; background: #EAAA00 !important; border: none !important;
                  border-radius: 50% !important; cursor: pointer !important; display: flex !important; align-items: center !important;
                  justify-content: center !important; font-size: 15px !important; box-shadow: 0px 2px 6px rgba(234,170,0,0.3) !important; transition: all 0.15s ease !important;
              ">⚡</button>

              <button id="harvester-toggle-settings" title="Toggle Prompt & Position Panel" style="
                  width: 30px !important; height: 30px !important; background: transparent !important; border: none !important;
                  cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important; transition: transform 0.2s ease !important;
              ">⚙️</button>
          </div>

          <div id="harvester-drawer" style="
              display: ${isExpanded ? 'flex' : 'none'};
              flex-direction: column !important;
              gap: 8px !important;
              width: 140px !important;
              padding-left: 6px !important;
              border-left: 1px solid #eaeaea !important;
              box-sizing: border-box !important;
          ">
              <div style="text-align: left !important;">
                  <label style="font-size: 10px !important; font-weight: bold !important; color: #555555 !important; display: block !important; margin-bottom: 2px !important;">Append Prompt:</label>
                  <input type="text" id="harvester-append-text" value="${savedPrompt}" style="
                      width: 100% !important; box-sizing: border-box !important; padding: 4px 6px !important;
                      font-size: 11px !important; border: 1px solid #cccccc !important; border-radius: 4px !important; outline: none !important;
                  " />
              </div>

              <div style="display: flex; gap: 4px; width: 100%;">
                  <button id="harvester-move-btn" title="Unlock Moving State" style="
                      flex: 1; font-size: 9px !important; font-weight: bold !important; padding: 4px 2px !important;
                      border-radius: 4px !important; border: 1px solid #cccccc !important; cursor: pointer !important;
                      background: ${isMoveMode ? '#EAAA00 !important; color: #006400 !important; border-color: #006400' : '#ffffff'};
                  ">${isMoveMode ? '⚓ Locked' : '🤚 Move UI'}</button>

                  <button id="harvester-reset-btn" title="Snap to Default Gutter Position" style="
                      flex: 1; font-size: 9px !important; font-weight: bold !important; padding: 4px 2px !important;
                      border-radius: 4px !important; border: 1px solid #cccccc !important; cursor: pointer !important;
                      background: #ffffff;
                  ">🔄 Reset</button>
              </div>

              <div style="text-align: left !important; margin-top: 2px !important;">
                  <span style="font-size: 9px !important; font-weight: bold !important; color: #888888 !important; display: block !important;">Last Copied:</span>
                  <div id="harvester-history" style="
                      font-size: 11px !important; color: #006400 !important; font-weight: bold !important;
                      white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; width: 130px !important;
                  " title="Last Captured: ${lastCapturedTitle}">${lastCapturedTitle}</div>
              </div>
          </div>
      `;

      // UI sizing alterations based on expanded toggle
      if (isExpanded) {
          panel.style.width = "210px";
          panel.style.borderRadius = "16px";
          panel.style.flexDirection = "row";
          document.getElementById("harvester-toggle-settings").style.transform = "rotate(45deg)";
      } else {
          panel.style.width = "54px";
          panel.style.borderRadius = "30px";
          panel.style.flexDirection = "column";
          document.getElementById("harvester-toggle-settings").style.transform = "rotate(0deg)";
      }

      // Event Re-Bindings
      let btnNormal = document.getElementById("harvester-copy-btn");
      let btnCustom = document.getElementById("harvester-custom-btn");
      let btnToggle = document.getElementById("harvester-toggle-settings");
      let btnMove = document.getElementById("harvester-move-btn");
      let btnReset = document.getElementById("harvester-reset-btn");
      let indicator = document.getElementById("harvester-indicator");

      btnNormal.addEventListener("mouseenter", () => { btnNormal.style.background = "#e6e6e6"; });
      btnNormal.addEventListener("mouseleave", () => { btnNormal.style.background = "#f4f4f4"; });
      btnCustom.addEventListener("mouseenter", () => { btnCustom.style.background = "#cc9600"; });
      btnCustom.addEventListener("mouseleave", () => { btnCustom.style.background = "#EAAA00"; });

      btnToggle.onclick = function(e) {
          e.stopImmediatePropagation();
          let currentInput = document.getElementById("harvester-append-text");
          if (currentInput) panel.dataset.savedPrompt = currentInput.value;

          // Force auto-lock state when drawer collapses out of sight
          if (isExpanded) isMoveMode = false; 

          isExpanded = !isExpanded;
          renderPanelContents(panel);
      };

      // Toggle Drag Capability State
      btnMove.onclick = function(e) {
          e.stopImmediatePropagation();
          isMoveMode = !isMoveMode;
          renderPanelContents(panel);
      };

      // Reset coordinates to default dynamic alignment mode
      btnReset.onclick = function(e) {
          e.stopImmediatePropagation();
          hasBeenMoved = false;
          isMoveMode = false;
          renderPanelContents(panel);
          injectDashboard(); // Force instant alignment update pass
      };

      // Maintain legacy workflow handlers
      btnNormal.onclick = function(e) {
          e.stopImmediatePropagation();
          let data = extractCleanQuizText();
          if (data && data.text) {
              let docsFormattedText = data.text + "\n-------------------------------------\n";
              navigator.clipboard.writeText(docsFormattedText).then(() => {
                  triggerFeedback("#006400", btnNormal, data.title);
              });
          }
      };

      btnCustom.onclick = function(e) {
          e.stopImmediatePropagation();
          let data = extractCleanQuizText();
          let currentInput = document.getElementById("harvester-append-text");
          let appendValue = currentInput ? currentInput.value.trim() : panel.dataset.savedPrompt.trim();

          if (data && data.text) {
              let finalPayload = data.text + "\n" + appendValue;
              navigator.clipboard.writeText(finalPayload).then(() => {
                  triggerFeedback("#2ec4b6", btnCustom, data.title);
              });
          }
      };

      function triggerFeedback(highlightColor, activeBtn, detectedTitle) {
          lastCapturedTitle = detectedTitle;
          let historyTracker = document.getElementById("harvester-history");
          if (historyTracker) {
              historyTracker.innerText = lastCapturedTitle;
              historyTracker.title = `Last Captured: ${lastCapturedTitle}`;
          }

          let originalIcon = activeBtn.innerText;
          activeBtn.innerText = "✔";
          indicator.style.backgroundColor = highlightColor;

          setTimeout(() => {
              activeBtn.innerText = originalIcon;
              indicator.style.backgroundColor = "#EAAA00";
          }, 1200);
      }
  }

  function setupDragAndDrop(panel) {
      let activeDrag = false;
      let startX, startY;

      panel.addEventListener("mousedown", (e) => {
          // Dragging only processes if explicitly toggled on inside parameters matrix
          if (!isMoveMode) return;

          // Prevent clicking input boxes/buttons from firing element offsets relocation
          if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;

          activeDrag = true;
          panel.style.transition = "none"; // Kill ease logic values during instant track vectors

          startX = e.clientX - panel.offsetLeft;
          startY = e.clientY - panel.offsetTop;
      });

      document.addEventListener("mousemove", (e) => {
          if (!activeDrag) return;

          hasBeenMoved = true;
          customX = e.clientX - startX;
          customY = e.clientY - startY;

          panel.style.left = `${customX}px`;
          panel.style.top = `${customY}px`;
      });

      document.addEventListener("mouseup", () => {
          if (activeDrag) {
              activeDrag = false;
              panel.style.transition = "width 0.25s ease-in-out, border-radius 0.25s ease-in-out !important";
          }
      });
  }

  function extractCleanQuizText() {
      let questionBlocks = document.querySelectorAll(".quiz_question, .question, .question_holder, .display_question");
      let activeBlock = null;
      for (let block of questionBlocks) {
          if (block.offsetWidth > 0 && block.offsetHeight > 0) { activeBlock = block; break; }
      }
      if (!activeBlock) activeBlock = document.querySelector("#submit_quiz_form, #questions");
      if (!activeBlock) return null;

      let rawText = activeBlock.innerText;
      let currentTitle = "Unknown Question";
      let selectedAnswers = getSelectedAnswerTexts(activeBlock);

      let titleEl = activeBlock.querySelector(".header, .question_header, .name");
      if (titleEl && titleEl.innerText.trim()) {
          currentTitle = titleEl.innerText.split('\n')[0].trim();
      }

      let lines = rawText.split('\n'), uniqueLines = [], seenLines = new Set();
      for (let line of lines) {
          let trimmed = line.trim();
          if (trimmed === "Group of answer choices" || trimmed === "Correct Answer" || trimmed === "Your Answer:") continue;
          if (selectedAnswers.has(trimmed)) trimmed += " (selected)";
          if (trimmed.length > 0 && !seenLines.has(trimmed)) { seenLines.add(trimmed); uniqueLines.push(trimmed); }
      }

      let cleanedText = "";
      if (uniqueLines.length > 0) {
          cleanedText += uniqueLines[0] + "\n";
          if (uniqueLines[1] && uniqueLines[1].includes("pts")) {
              cleanedText += uniqueLines[1] + "\n" + uniqueLines[2] + "\n\n" + uniqueLines.slice(3).join("\n");
          } else {
              cleanedText += uniqueLines[1] + "\n\n" + uniqueLines.slice(2).join("\n");
          }
      }
      return { text: cleanedText.trim(), title: currentTitle };
  }

  function getSelectedAnswerTexts(activeBlock) {
      let selectedTexts = new Set();
      let checkedInputs = activeBlock.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');

      for (let input of checkedInputs) {
          let answerText = getAnswerTextForInput(input, activeBlock);
          if (answerText) selectedTexts.add(answerText);
      }

      return selectedTexts;
  }

  function getAnswerTextForInput(input, activeBlock) {
      let label = input.closest("label");
      if (!label && input.id) {
          label = activeBlock.querySelector(`label[for="${cssEscape(input.id)}"]`);
      }

      if (label) {
          let labelText = label.innerText.trim();
          if (labelText) return labelText;
      }

      let answerContainer = input.closest(".answer, .answer_label, .answer_text, li, p, div");
      if (answerContainer) {
          let containerText = answerContainer.innerText.trim();
          if (containerText) return containerText;
      }

      let siblingText = input.nextSibling && input.nextSibling.textContent ? input.nextSibling.textContent.trim() : "";
      return siblingText;
  }

  function cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === "function") {
          return window.CSS.escape(value);
      }

      return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  setInterval(injectDashboard, 1000);
})();
>>>>>>> 5fcc4190e524e1ca3fa0dbf61b4f750e24773026
