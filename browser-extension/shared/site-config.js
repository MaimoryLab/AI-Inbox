globalThis.AIIndexSiteConfig = {
  providers: [
    {
      id: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turnSelectors: [
        "[data-message-author-role]",
        "[data-testid^='conversation-turn']",
        "article"
      ],
      roleFromElement(element) {
        const role = element.getAttribute("data-message-author-role");
        if (role === "user" || role === "assistant") return role;
        const testId = element.getAttribute("data-testid") || "";
        if (testId.includes("user")) return "user";
        if (testId.includes("assistant")) return "assistant";
        return "";
      }
    },
    {
      id: "claude",
      hosts: ["claude.ai"],
      turnSelectors: [
        "[data-testid='user-message']",
        "[data-testid='assistant-message']",
        "[data-testid^='chat-message']",
        ".font-user-message",
        ".font-claude-message"
      ],
      roleFromElement(element) {
        const testId = element.getAttribute("data-testid") || "";
        if (testId.includes("user")) return "user";
        if (testId.includes("assistant")) return "assistant";
        if (element.closest("[data-testid='user-message']") || element.classList.contains("font-user-message")) return "user";
        if (element.closest("[data-testid='assistant-message']") || element.classList.contains("font-claude-message")) return "assistant";
        return "";
      }
    },
    {
      id: "gemini",
      hosts: ["gemini.google.com"],
      turnSelectors: [
        "user-query",
        "model-response",
        "message-content",
        "main article"
      ],
      roleFromElement(element) {
        const tag = element.tagName.toLowerCase();
        if (tag === "user-query") return "user";
        if (tag === "model-response") return "assistant";
        const label = `${element.getAttribute("data-testid") || ""} ${element.className || ""}`.toLowerCase();
        if (label.includes("user")) return "user";
        if (label.includes("model") || label.includes("response")) return "assistant";
        return "";
      }
    },
    {
      id: "perplexity",
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      turnSelectors: [
        "[data-testid*='thread']",
        "[class*='prose']",
        "main article"
      ],
      roleFromElement(element) {
        const label = `${element.getAttribute("data-testid") || ""} ${element.className || ""}`.toLowerCase();
        if (label.includes("user") || label.includes("query")) return "user";
        if (label.includes("assistant") || label.includes("answer") || label.includes("prose")) return "assistant";
        return "";
      }
    },
    {
      id: "grok",
      hosts: ["grok.com", "x.ai"],
      turnSelectors: [
        "[data-testid*='message']",
        "[class*='message']",
        "main article"
      ],
      roleFromElement(element) {
        const label = `${element.getAttribute("data-testid") || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
        if (label.includes("user")) return "user";
        if (label.includes("assistant") || label.includes("grok")) return "assistant";
        return "";
      }
    },
    {
      id: "deepseek",
      hosts: ["chat.deepseek.com", "deepseek.com"],
      turnSelectors: [
        "[class*='message']",
        "[class*='chat']",
        "main article"
      ],
      roleFromElement(element) {
        const label = `${element.getAttribute("data-testid") || ""} ${element.className || ""}`.toLowerCase();
        if (label.includes("user")) return "user";
        if (label.includes("assistant") || label.includes("ai")) return "assistant";
        return "";
      }
    }
  ],
  providerForHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return this.providers.find((provider) => provider.hosts.some((item) => host === item || host.endsWith(`.${item}`))) || null;
  },
  isSupportedUrl(url) {
    try {
      return !!this.providerForHost(new URL(url).hostname);
    } catch {
      return false;
    }
  }
};
