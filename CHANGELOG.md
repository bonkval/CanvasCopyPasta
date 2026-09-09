# Changelog

## 5.1.1 - 2026-09-09

- Fixed copying question stems from Canvas layouts whose question content uses a broad header container.
- Fixed extraction of image- and canvas-based question stems.

## 5.1.0 - 2026-09-08

- Added automatic detection of meaningful images inside the active question.
- Added an image-copy button that copies one image or combines multiple images into one PNG.
- Added image descriptions to plain-text question output and clear image-copy failure feedback.

## 5.0.0 - 2026-09-08

- Replaced one-second polling with immediate startup and a debounced DOM observer.
- Added viewport-aware question selection and structured answer extraction.
- Added persistent prompt, position, visibility, origin, and history settings.
- Added clipboard failure feedback and a legacy copy fallback.
- Isolated the existing panel design with Shadow DOM and improved accessibility.
- Added pointer-based bounded dragging.
- Added FEU-default and user-approved school-origin support with auto detection.
- Added extension icons, documentation, tests, checks, CI, privacy disclosure, and packaging.
