# Canvas Copy Assistant

Canvas Copy Assistant is a lightweight browser extension that places a compact copy toolbar beside the currently visible Canvas quiz question. It can copy clean question text or append a user-configurable prompt for workflows where AI assistance is explicitly allowed.

> [!IMPORTANT]
> This project is for convenience, accessibility, study, review, and quizzes that are explicitly AI-assisted or AI-integrated. It is not intended to bypass academic rules or enable cheating. Always follow your instructor's assessment policy and your school's academic-integrity rules.

## What it does

- Appears as soon as Canvas renders a question and follows same-page question changes without a one-second polling delay.
- Chooses the visible question nearest the center of the screen.
- Copies clean text or clean text plus a customizable prompt.
- Marks selected radio and checkbox answers in copied text.
- Preserves prompt, position, visibility, and copy history across reloads.
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
- **Gear:** opens prompt, school URL, position, and history settings.
- **Backslash (`\\`):** hides or shows the toolbar while focus is not inside a text field.

To move the toolbar, open settings, select **Move UI**, and drag the blank part of the panel. Select **Reset** to return it to the question gutter.

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
npm test
npm run lint
npm run check
```

On Windows, create a distributable ZIP with:

```powershell
npm run package
```

The archive is written to `dist/`. Do not package development files or private quiz content.

## Privacy and permissions

The extension performs question extraction locally in the page and writes only when you select a copy button. It does not send question content to a server. See [PRIVACY.md](PRIVACY.md) for details.

## Known compatibility notes

Canvas markup varies by institution and quiz engine. Classic Quizzes and common New Quizzes structures are recognized, including same-origin frames. A separately hosted quiz tool may require granting that tool's origin through the extension popup. Please report a sanitized HTML fixture when reporting extraction bugs—never upload a real active assessment.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE).
