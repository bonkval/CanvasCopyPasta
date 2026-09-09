const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Core = require("../core.js");

test("normalizes a school host to its https origin", () => {
  assert.equal(Core.normalizeSchoolOrigin("school.instructure.com/courses/1"), "https://school.instructure.com");
});

test("rejects unsafe school protocols", () => {
  assert.throws(() => Core.normalizeSchoolOrigin("javascript:alert(1)"), /valid school URL/);
});

test("preserves duplicate answer text and marks selected answers", () => {
  const text = Core.buildQuestionText({
    title:"Question 2", points:"1 pts", prompt:"Choose one", answers:[
      { text:"Same", selected:false }, { text:"Same", selected:true }
    ]
  });
  assert.equal(text, "Question 2\n\n1 pts\n\nChoose one\n\nSame\nSame (selected)");
});

test("formats a sanitized Classic Quiz fixture", () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "classic-question.json"), "utf8"));
  assert.match(Core.buildQuestionText(fixture), /Option B \(selected\)$/);
});

test("selects the visible candidate nearest the viewport center", () => {
  const first = { element:"first", rect:{ top:20, bottom:120, width:100, height:100 } };
  const middle = { element:"middle", rect:{ top:350, bottom:550, width:100, height:200 } };
  const hidden = { element:"hidden", rect:{ top:900, bottom:1000, width:100, height:100 } };
  assert.equal(Core.chooseNearestCandidate([first, middle, hidden], 800), "middle");
});

test("content extractor handles a question stem whose element is the image", () => {
  const source = readFileSync(join(__dirname, "..", "content.js"), "utf8");
  assert.match(source, /if \(element\.matches\?\.\("img, canvas"\)\)/);
  assert.match(source, /return description \? `\[Image: \$\{description\}\]` : "\[Question image\]"/);
});

test("fallback extraction does not remove the question content header", () => {
  const source = readFileSync(join(__dirname, "..", "content.js"), "utf8");
  assert.match(source, /const fallbackRoots = \[block, block\.parentElement, block\.parentElement\?\.parentElement\]/);
  assert.match(source, /clone\.querySelectorAll\("\.name, \.points/);
  assert.doesNotMatch(source, /clone\.querySelectorAll\("\.question_header/);
});
