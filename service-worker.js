"use strict";

const DEFAULT_ORIGIN = "https://feu.instructure.com";
const SCRIPT_PREFIX = "canvas-copy-school-";

function normalizeOrigin(value) {
  const input = String(value || "").trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url;
  try { url = new URL(withScheme); }
  catch { throw new Error("Enter a valid school URL."); }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Enter a valid http or https school URL.");
  return url.origin;
}

function scriptId(origin) {
  let hash = 2166136261;
  for (const char of origin) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `${SCRIPT_PREFIX}${(hash >>> 0).toString(36)}`;
}

async function registerOrigin(origin) {
  if (origin === DEFAULT_ORIGIN) return;
  const id = scriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids:[id] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids:[id] });
  await chrome.scripting.registerContentScripts([{
    id, matches:[`${origin}/*`], js:["core.js", "content.js"], allFrames:true,
    runAt:"document_start", persistAcrossSessions:true
  }]);
}

async function restoreOrigins() {
  const { allowedOrigins = [DEFAULT_ORIGIN] } = await chrome.storage.local.get("allowedOrigins");
  for (const value of allowedOrigins) {
    try {
      const origin = normalizeOrigin(value);
      if (await chrome.permissions.contains({ origins:[`${origin}/*`] })) await registerOrigin(origin);
    } catch { /* Ignore stale invalid entries. */ }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("allowedOrigins").then(({ allowedOrigins }) => {
    if (!allowedOrigins) return chrome.storage.local.set({ allowedOrigins:[DEFAULT_ORIGIN], schoolOrigin:DEFAULT_ORIGIN });
  }).then(restoreOrigins).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => restoreOrigins().catch(() => {}));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "register-origin") return false;
  (async () => {
    const origin = normalizeOrigin(message.origin);
    const pattern = `${origin}/*`;
    const granted = origin === DEFAULT_ORIGIN || await chrome.permissions.contains({ origins:[pattern] });
    if (!granted) throw new Error("Access was not granted. Use the extension toolbar popup and try again.");
    const { allowedOrigins = [DEFAULT_ORIGIN] } = await chrome.storage.local.get("allowedOrigins");
    const updated = [...new Set([...allowedOrigins, origin])];
    await chrome.storage.local.set({ allowedOrigins:updated, schoolOrigin:origin });
    await registerOrigin(origin);
    sendResponse({ ok:true, origin });
  })().catch((error) => sendResponse({ ok:false, error:error.message }));
  return true;
});
