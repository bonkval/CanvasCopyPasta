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

      let titleEl = activeBlock.querySelector(".header, .question_header, .name");
      if (titleEl && titleEl.innerText.trim()) {
          currentTitle = titleEl.innerText.split('\n')[0].trim();
      }

      let lines = rawText.split('\n'), uniqueLines = [], seenLines = new Set();
      for (let line of lines) {
          let trimmed = line.trim();
          if (trimmed === "Group of answer choices" || trimmed === "Correct Answer" || trimmed === "Your Answer:") continue;
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

  setInterval(injectDashboard, 1000);
})();