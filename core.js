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
    return String(text || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/&(?:nbsp|#160|#xA0);/gi, " ")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line && !["Group of answer choices", "Correct Answer", "Your Answer:"].includes(line));
  }

  function cleanAnswerText(text) {
    const normalized = cleanLines(text).join(" ");
    if (!normalized) return "";
    const metadata = normalized.match(/(?:\bexact_answer\b|\bwith\s+margin\s*:|\bwith\s+precision\s*:|\bbetween\s+\S[\s\S]*?margin\s+of\s+error\b)/i);
    let answer = metadata ? normalized.slice(0, metadata.index).trim() : normalized;
    if (metadata && /^\d+\s+/.test(answer)) answer = answer.replace(/^\d+\s+/, "");
    const duplicatedBoolean = answer.match(/^(True|False)\s+\1$/i);
    return (duplicatedBoolean ? duplicatedBoolean[1] : answer).trim();
  }

  function cleanImageDescription(text) {
    const description = cleanLines(text).join(" ");
    if (!description) return "";
    const filename = description.split(/[\\/]/).pop().split(/[?#]/)[0];
    return /^[^<>:"/\\|?*]+\.[a-z\d]{2,8}$/i.test(filename) ? "" : description;
  }

  function buildQuestionText(parts) {
    const title = String(parts.title || "").trim();
    const points = String(parts.points || "").trim();
    const prompt = cleanLines(parts.prompt).join("\n");
    const answers = (parts.answers || []).map((answer) => {
      const text = cleanAnswerText(answer.text);
      if (!text) return "";
      const labels = [];
      if (answer.selected) labels.push("selected");
      if (answer.correct === true) labels.push("correct");
      if (answer.correct === false) labels.push("wrong");
      return labels.length ? `${text} (${labels.join(", ")})` : text;
    }).filter(Boolean);
    return [title, points, prompt, answers.join("\n")].filter(Boolean).join("\n\n");
  }

  function formatReviewResult(result) {
    if (!result) return "";
    const score = result.score == null ? "" : result.score;
    const max = result.max == null ? "" : result.max;
    const points = score !== "" && max !== "" ? ` (${score} / ${max} pts)` : "";
    if (result.correct === true) return `Result: Correct${points}`;
    if (result.correct === false) return `Result: Incorrect${points}`;
    return score !== "" && max !== "" ? `Result: ${score} / ${max} pts` : "";
  }

  function buildReviewText(parts) {
    const question = buildQuestionText(parts);
    const result = formatReviewResult(parts.result);
    const images = (parts.images || []).map((image, index) => {
      const description = cleanImageDescription(image.alt || image.description);
      return `[Image ${index + 1}${description ? `: ${description}` : ""}]`;
    });
    return [question, result, images.length ? `Images:\n${images.join("\n")}` : ""]
      .filter(Boolean).join("\n\n");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[character]);
  }

  function buildReviewHtml(parts) {
    const title = escapeHtml(parts.title || "Question");
    const result = escapeHtml(formatReviewResult(parts.result));
    const prompt = escapeHtml(cleanLines(parts.prompt).join("\n"));
    const answers = (parts.answers || []).map((answer) => {
      const labels = [];
      if (answer.selected) labels.push("selected");
      if (answer.correct === true) labels.push("correct");
      if (answer.correct === false) labels.push("wrong");
      const suffix = labels.length ? ` <em>(${labels.join(", ")})</em>` : "";
      return `<p>${escapeHtml(cleanAnswerText(answer.text))}${suffix}</p>`;
    }).filter(Boolean).join("");
    const images = (parts.images || []).map((image, index) => {
      const alt = escapeHtml(cleanImageDescription(image.alt || image.description));
      const source = escapeHtml(image.dataUrl || "");
      return source ? `<figure><img src="${source}" alt="${alt}"></figure>` : "";
    }).filter(Boolean).join("");
    return `<article><h2>${title}</h2>${result ? `<p><strong>${result}</strong></p>` : ""}<p>${prompt.replace(/\n/g, "<br>")}</p>${images ? `<section class="images">${images}</section>` : ""}${answers ? `<section class="answers">${answers}</section>` : ""}</article>`;
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

  return { QUESTION_SELECTOR, FALLBACK_SELECTOR, normalizeSchoolOrigin, cleanLines, cleanAnswerText, cleanImageDescription, buildQuestionText, formatReviewResult, buildReviewText, buildReviewHtml, escapeHtml, chooseNearestCandidate };
});
