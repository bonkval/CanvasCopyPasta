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

test("treats non-breaking-space paragraphs as spaces and removes Canvas answer metadata", () => {
  assert.deepEqual(Core.cleanLines('<p>&nbsp;</p><p><img src="/assessment_questions/1/files/2/download" alt="33.gif"></p><p>Refer the exhibit.</p>'), ["Refer the exhibit."]);
  assert.deepEqual(Core.cleanLines("&lt;p&gt;Readable words&lt;/p&gt;"), ["Readable words"]);
  assert.deepEqual(Core.cleanLines("True\n\u00a0\nFalse"), ["True", "False"]);
  assert.doesNotMatch(Core.buildReviewText({ prompt:"<p>Readable words</p>" }), /<\/?p>/);
  assert.equal(
    Core.cleanAnswerText("5385 True True exact_answer none 25187611 5385 0 (with margin: 0)"),
    "True"
  );
  assert.equal(
    Core.cleanAnswerText("6195 False False exact_answer none 25187611 6195 0 (with margin: 0)"),
    "False"
  );
  assert.equal(Core.cleanAnswerText("Late collision Late collision"), "Late collision");
  assert.equal(Core.cleanAnswerText("Correct! 7114 Late collision Late collision"), "Correct! Late collision");
  assert.equal(Core.cleanAnswerText("You Answered 6355 logging synchronous logging synchronous"), "You Answered logging synchronous");
});

test("removes image filenames without removing image content", () => {
  assert.equal(Core.cleanImageDescription("5.png"), "");
  assert.equal(Core.cleanImageDescription("/files/33.gif?download=1"), "");
  assert.equal(Core.cleanImageDescription("Network topology diagram"), "Network topology diagram");
  const html = Core.buildReviewHtml({ images:[{ alt:"5.png", dataUrl:"data:image/png;base64,abc" }] });
  assert.match(html, /data:image\/png;base64,abc/);
  assert.doesNotMatch(html, /5\.png|<figcaption>/);
});

test("formats selected answers with correctness for review", () => {
  const text = Core.buildReviewText({
    title:"Question 2", points:"1 pts", prompt:"Choose one", result:{ score:0, max:1, correct:false },
    answers:[
      { text:"Option A", selected:true, correct:false },
      { text:"Option B", selected:false, correct:true }
    ],
    images:[{ alt:"Network diagram" }]
  });
  assert.doesNotMatch(text, /(?:0 \/ 1|1 pts|Result:)/);
  assert.match(text, /Option A \(wrong\)/);
  assert.match(text, /Option B \(correct\)/);
  assert.match(text, /\[Image 1: Network diagram\]/);
});

test("formats Classic Quiz review text without scores or leaked icon IDs", () => {
  const correct = Core.buildReviewText({
    title:"Question 1", points:"1 / 1 pts", prompt:"It is a collision that occurs after 512 bits of the frame have been transmitted.",
    result:{ score:1, max:1, correct:true },
    answers:[
      { text:"Correct! 7114 Late collision Late collision", selected:true, correct:true },
      { text:"Crc errors" }, { text:"Runts" }, { text:"Latency" }
    ]
  });
  assert.equal(correct, "Question 1\n\nIt is a collision that occurs after 512 bits of the frame have been transmitted.\n\nCorrect! Late collision\nCrc errors\nRunts\nLatency");

  const wrong = Core.buildReviewText({
    title:"Question 2", points:"0 / 1 pts", prompt:"Which command is used to enable logging in console interface?",
    result:{ score:0, max:1, correct:false },
    answers:[
      { text:"login", correct:true }, { text:"enable login" }, { text:"enable logging" },
      { text:"You Answered 6355 logging synchronous logging synchronous", selected:true, correct:false }
    ]
  });
  assert.equal(wrong, "Question 2\n\nWhich command is used to enable logging in console interface?\n\nlogin (correct)\nenable login\nenable logging\nYou Answered logging synchronous (wrong)");
});

test("failed reviews keep only correct and wrong indicators", () => {
  const text = Core.buildReviewText({
    title:"Question 3", prompt:"Choose the configuration problem.",
    result:{ score:0, max:1, correct:false },
    answers:[
      { text:"Correct! 7114 Wrong VLAN", selected:true, correct:true },
      { text:"No IP address" },
      { text:"Command entered incorrectly", selected:true, correct:false }
    ]
  });
  assert.equal(text, "Question 3\n\nChoose the configuration problem.\n\nCorrect! Wrong VLAN\nNo IP address\nCommand entered incorrectly (wrong)");
  assert.doesNotMatch(text, /selected/);
});

test("builds rich review HTML with escaped text and embedded images", () => {
  const html = Core.buildReviewHtml({
    title:"Question <1>", prompt:"Pick <one>", result:{ score:1, max:1, correct:true },
    answers:[{ text:"A & B", selected:true, correct:true }],
    images:[{ alt:"A diagram", dataUrl:"data:image/png;base64,abc" }]
  });
  assert.match(html, /Question &lt;1&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /src="data:image\/png;base64,abc"/);
  assert.doesNotMatch(html, /<ol>|<li>/);
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

test("content extractor includes all-question review export support", () => {
  const source = readFileSync(join(__dirname, "..", "content.js"), "utf8");
  assert.match(source, /function collectAllQuestions\(\)/);
  assert.match(source, /Copy all reviewed questions/);
  assert.match(source, /function parseAnswerList\(value\)/);
  assert.match(source, /function applyAnswers\(\)/);
  assert.match(source, /text\\s\*:/);
  assert.match(source, /isCheckboxChoice/);
  assert.match(source, /requested = entry\.answer\.split/);
  assert.match(source, /text\/html/);
  assert.match(source, /scoreMatch = text\.match/);
  assert.match(source, /\^Correct!/);
  assert.match(source, /\^You Answered/);
});

test("fallback extraction does not remove the question content header", () => {
  const source = readFileSync(join(__dirname, "..", "content.js"), "utf8");
  assert.match(source, /const fallbackRoots = \[block, block\.parentElement, block\.parentElement\?\.parentElement\]/);
  assert.match(source, /clone\.querySelectorAll\("\.name, \.points/);
  assert.doesNotMatch(source, /clone\.querySelectorAll\("\.question_header/);
});
