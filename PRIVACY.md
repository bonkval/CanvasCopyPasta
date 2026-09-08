# Privacy

Canvas Copy Assistant processes Canvas page content locally in the browser. It does not operate a server, transmit quiz content, sell data, use analytics, or track browsing history.

The extension stores only user preferences on the local browser profile: the append prompt, toolbar state and position, last copied question title, and explicitly approved Canvas origins. Clipboard content is written only after the user selects a copy button.

Permissions are used as follows:

- `clipboardWrite`: copies the text the user requested.
- `storage`: keeps settings across reloads.
- `scripting`: registers the content script on a school origin the user explicitly approves.
- `activeTab`: detects the current school's origin when the toolbar popup is opened.
- FEU host access: provides the project's default supported Canvas installation.
- Optional site access: requested at runtime only for another school origin selected by the user.

The extension does not request account passwords. Browser synchronization is not used by the current implementation.
