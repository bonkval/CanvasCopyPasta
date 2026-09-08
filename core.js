(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CanvasCopyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const QUESTION_SELECTOR = [
    ".quiz_question", ".display_question", ".question_holder", ".question",
    "[data-testid='question-container']", "[data-testid='question-wrapper']"
  ].join(",");
  const FALLBACK_SELECTOR = "#submit_quiz_form, #questions, [data-testid='quiz-container']";

  function normalizeSchoolOrigin(value) {
    const input = String(value || "").trim();
    if (!input) throw new Error("Enter your Canvas school URL.");
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    let url;
    try { url = new URL(withScheme); }
    catch { throw new Error("Enter a valid school URL."); }
    if (!/^https?:$/.test(url.protocol)) throw new Error("Use an http or https URL.");
    if (!url.hostname || url.username || url.password) throw new Error("Enter a valid school URL.");
    return url.origin;
  }

  function cleanLines(text) {
    return String(text || "").split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line && !["Group of answer choices", "Correct Answer", "Your Answer:"].includes(line));
  }

  function buildQuestionText(parts) {
    const title = String(parts.title || "").trim();
    const points = String(parts.points || "").trim();
    const prompt = cleanLines(parts.prompt).join("\n");
    const answers = (parts.answers || []).map((answer) => {
      const text = cleanLines(answer.text).join(" ");
      return answer.selected && text ? `${text} (selected)` : text;
    }).filter(Boolean);
    return [title, points, prompt, answers.join("\n")].filter(Boolean).join("\n\n");
  }

  function chooseNearestCandidate(candidates, viewportHeight) {
    const center = viewportHeight / 2;
    let best = null;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const rect = candidate.rect || candidate.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewportHeight) continue;
      const distance = Math.abs((Math.max(0, rect.top) + Math.min(viewportHeight, rect.bottom)) / 2 - center);
      const score = distance + Math.max(0, -rect.top) * 0.05;
      if (score < bestScore) {
        best = candidate.element || candidate;
        bestScore = score;
      }
    }
    return best;
  }

  return { QUESTION_SELECTOR, FALLBACK_SELECTOR, normalizeSchoolOrigin, cleanLines, buildQuestionText, chooseNearestCandidate };
});
