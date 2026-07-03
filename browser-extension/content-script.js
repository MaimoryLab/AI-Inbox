(function () {
  const MESSAGE_COLLECT = "AI_INDEX_COLLECT_PAGE";
  const MESSAGE_PAGE_CHANGED = "AI_INDEX_PAGE_CHANGED";
  const MAX_TURNS = 160;

  if (globalThis.__aiIndexContentLoaded) return;
  globalThis.__aiIndexContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_COLLECT) return false;
    sendResponse(collectPage());
    return false;
  });

  let timer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: MESSAGE_PAGE_CHANGED }).catch(() => {});
    }, 1200);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  function collectPage() {
    const provider = providerForLocation(location.hostname);
    if (!provider) return { ok: false, error: "unsupported_page" };
    const turns = collectTurns(provider);
    if (!turns.length) return { ok: false, error: "no_turns" };
    return {
      ok: true,
      capture: {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        page: {
          url: location.href,
          title: document.title,
          host: location.hostname
        },
        conversation: {
          provider: provider.id,
          turns
        }
      }
    };
  }

  function providerForLocation(hostname) {
    return globalThis.AIIndexSiteConfig?.providerForHost?.(hostname) || null;
  }

  function collectTurns(provider) {
    const elements = unique(provider.turnSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    const turns = [];
    for (const element of elements) {
      if (!isVisible(element)) continue;
      const text = cleanText(element.innerText || element.textContent || "");
      if (!text) continue;
      if (turns[turns.length - 1]?.text === text) continue;
      turns.push({
        role: provider.roleFromElement(element) || inferRole(element),
        text
      });
    }
    return turns.slice(-MAX_TURNS);
  }

  function inferRole(element) {
    const label = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.className,
      element.parentElement?.getAttribute("data-testid"),
      element.parentElement?.className
    ].join(" ").toLowerCase();
    if (label.includes("user") || label.includes("human")) return "user";
    if (label.includes("assistant") || label.includes("claude") || label.includes("gpt")) return "assistant";
    return "unknown";
  }

  function cleanText(text) {
    return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
})();
