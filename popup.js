(function () {
  "use strict";
  const Core = globalThis.CanvasCopyCore;
  const input = document.querySelector("#school-url");
  const status = document.querySelector("#status");

  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle("error", error); }
  async function currentTab() { return (await chrome.tabs.query({ active:true, currentWindow:true }))[0]; }

  document.querySelector("#detect").addEventListener("click", async () => {
    try {
      const tab = await currentTab();
      if (!tab?.url) throw new Error("Open your Canvas school page first.");
      const url = new URL(tab.url);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Open your Canvas school page first.");
      input.value = url.origin;
      setStatus(`Detected ${url.hostname}. Select Allow & save.`);
    } catch (error) { setStatus(error.message, true); }
  });

  document.querySelector("#save").addEventListener("click", async () => {
    try {
      const origin = Core.normalizeSchoolOrigin(input.value);
      input.value = origin;
      const granted = await chrome.permissions.request({ origins:[`${origin}/*`] });
      if (!granted) throw new Error("Site access was not granted.");
      const response = await chrome.runtime.sendMessage({ type:"register-origin", origin });
      if (!response?.ok) throw new Error(response?.error || "Could not save this site.");
      setStatus(`Ready on ${new URL(origin).hostname}. Reload Canvas once.`);
    } catch (error) { setStatus(error.message, true); }
  });

  chrome.storage.local.get({ schoolOrigin:"https://feu.instructure.com" }).then(({ schoolOrigin }) => { input.value = schoolOrigin; });
})();
