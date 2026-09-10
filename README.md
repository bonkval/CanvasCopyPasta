# Canvas Copy Assistant

Canvas Copy Assistant is a lightweight browser extension that places a compact toolbar beside the currently visible Canvas question. It supports local question copying, review exports, and applying a user-provided answer list for workflows where AI assistance and automation are explicitly allowed.

> [!IMPORTANT]
> This project is for convenience, accessibility, study, review, and quizzes that are explicitly AI-assisted or AI-integrated. It is not intended to bypass academic rules or enable cheating. Always follow your instructor's assessment policy and your school's academic-integrity rules.

## What it does

- Appears as soon as Canvas renders a question and follows same-page question changes without a one-second polling delay.
- Chooses the visible question nearest the center of the screen.
- Copies clean text or clean text plus a customizable prompt.
- Shows an image button when the active question contains an image; multiple images are combined into one PNG for easy pasting.
- Marks selected radio and checkbox answers in copied text.
- Copies every question on a review page in DOM order, including selected answers, per-question correctness, and organized inline images.
- Removes literal HTML, image filenames, Canvas metadata, duplicate answer labels, and non-breaking spaces from copied text.
- Applies a user-provided answer list to supported Canvas questions, with automatic radio matching, checkbox-group support, and an explicit `text:` override for text boxes.
- Preserves prompt, answer list, position, visibility, and copy history across reloads.
- Uses an isolated Shadow DOM so Canvas styles do not change the toolbar's appearance.
- Supports keyboard focus, screen-reader labels, touch/pen dragging, and clipboard error feedback.
- Supports FEU Canvas by default and lets users grant access to another Canvas school site.

## Install from source

Download this repository as a ZIP and extract it, or clone it. The folder you select in your browser must contain `manifest.json` directly—not another nested copy of the project folder.

### Google Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the upper-right corner.
3. Select **Load unpacked**.
4. Select the extracted `CopyPasteCanvas` folder.
5. Pin **Canvas Copy Assistant** from the Extensions menu.

### Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the extracted `CopyPasteCanvas` folder.
5. Pin the extension from Brave's Extensions menu.

### Opera GX

1. Open `opera://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the extracted `CopyPasteCanvas` folder.
5. Pin the extension from the Extensions menu.

When source files change, return to the browser's extensions page and select the extension's **Reload** button.

## Use

Open a supported Canvas quiz. The compact green-and-gold toolbar appears beside the visible question.

- **Clipboard:** copies clean question text.
- **Lightning:** copies the question and appends your saved prompt.
- **Image:** appears when the question contains an image and copies it as PNG. Paste the image first, then use Clipboard or Lightning to copy the accompanying text.
- **Gear:** opens prompt, school URL, position, history, and the **Copy all reviewed questions** action. The all-question action writes both plain text and rich HTML to the clipboard; images stay beneath the question that contains them when pasted into a rich editor.
- **A:** opens Answer list mode. Enter one answer per line, preview the matches, and select **Apply answers**. Multiple choice is automatic; use `text:` for a text box, for example `3. text: 192.168.1.1`, or `|`/`;` between answers for checkbox questions, for example `4. Option A | Option C`. The tool does not submit the quiz.
- **Backslash (`\\`):** hides or shows the toolbar while focus is not inside a text field.

To move the toolbar, open settings, select **Move UI**, and drag the blank part of the panel. Select **Reset** to return it to the question gutter.

Answer list mode is intentionally question-number based and accepts any number of questions. It validates every supplied answer before changing the page. If a choice is missing, ambiguous, disabled, or the requested text field cannot be identified, no answers are applied.

## Add another school

FEU (`https://feu.instructure.com`) works by default.

1. Open your own school's Canvas page.
2. Select the extension icon in the browser toolbar.
3. Select **Auto detect**.
4. Confirm the detected address and select **Allow & save**.
5. Approve access for that site, then reload Canvas once.

The extension requests access only to the origin you approve. A school URL can also be recorded in the in-page settings, but new browser site access must be approved through the toolbar popup.

## Development

Node.js 18 or later is sufficient; the checks have no third-party dependencies.

```sh
cd "C:\Users\cedri\OneDrive\Desktop\CopyPasteCanvas"
npm test
npm run lint
npm run check
```

On Windows, create a distributable ZIP with:

```powershell
cd "C:\Users\cedri\OneDrive\Desktop\CopyPasteCanvas"
npm run package
```

The archive is written to `dist/`. Do not package development files or private quiz content.

## Privacy and permissions

The extension processes question extraction and answer-list matching locally in the page. It does not send question content or answers to a server. Clipboard content is written only after a copy action; page form controls change only after you select **Apply answers**. The extension never submits a quiz automatically. See [PRIVACY.md](PRIVACY.md) for details.

## Known compatibility notes

Canvas markup varies by institution and quiz engine. Classic Quizzes and common New Quizzes structures are recognized, including same-origin frames. Common radio buttons, checkbox groups, textareas, text inputs, and contenteditable text fields are supported, but unusual custom controls may require a sanitized fixture. A separately hosted quiz tool may require granting that tool's origin through the extension popup. Never upload real active assessment content.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE).
