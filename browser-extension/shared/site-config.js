globalThis.AIIndexSiteConfig = (() => {
const COMMON_CHAT_TURN_SELECTORS = [
  "[data-message-author-role]",
  "[data-testid*='message']",
  "[data-testid*='conversation']",
  "[data-testid*='answer']",
  "[class*='message']",
  "[class*='Message']",
  "[class*='chat-item']",
  "[class*='conversation']",
  "[class*='bubble']",
  "[class*='answer']",
  "main article"
];

const COMMON_EDITOR_SELECTORS = ["textarea[placeholder]", "textarea", "[contenteditable='true']"];
const COMMON_ANCHOR_SELECTORS = ["form", "textarea[placeholder]", "textarea", "[contenteditable='true']", "main"];
const COMMON_SEND_SELECTORS = ["button[aria-label*='Send']", "button[aria-label*='发送']", "button[aria-label*='提交']", "button[type='submit']"];
const DEFAULT_PROVIDER_CONTROLS = {
  editorSelectors: COMMON_EDITOR_SELECTORS,
  anchorSelectors: COMMON_ANCHOR_SELECTORS,
  adjacentSelectors: [],
  sendSelectors: COMMON_SEND_SELECTORS,
  placement: "input-corner"
};

function roleFromCommonElement(element) {
  const label = [
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-role"),
    element.getAttribute("role"),
    element.className,
    element.parentElement?.getAttribute("aria-label"),
    element.parentElement?.getAttribute("data-testid"),
    element.parentElement?.className
  ].join(" ").toLowerCase();
  if (
    label.includes("user") ||
    label.includes("human") ||
    label.includes("query") ||
    label.includes("question") ||
    label.includes("用户") ||
    label.includes("我") ||
    label.includes("提问") ||
    label.includes("问题")
  ) return "user";
  if (
    label.includes("assistant") ||
    label.includes("answer") ||
    label.includes("ai") ||
    label.includes("bot") ||
    label.includes("model") ||
    label.includes("response") ||
    label.includes("助手") ||
    label.includes("回答") ||
    label.includes("回复") ||
    label.includes("豆包") ||
    label.includes("通义") ||
    label.includes("千问") ||
    label.includes("kimi") ||
    label.includes("智谱") ||
    label.includes("清言") ||
    label.includes("文心") ||
    label.includes("元宝") ||
    label.includes("星火") ||
    label.includes("海螺") ||
    label.includes("百川")
  ) return "assistant";
  return "";
}

return {
  providers: [
    {
      id: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      editorSelectors: ["#prompt-textarea", "[data-testid='prompt-textarea']", "textarea[placeholder]", "textarea", "[contenteditable='true']"],
      anchorSelectors: ["[data-testid='composer-trailing-actions']", ".composer-trailing-actions", "form", "main form"],
      adjacentSelectors: ["button[aria-label='Dictate button']", "button[aria-label*='mic' i]", "button[aria-label*='voice' i]"],
      sendSelectors: ["button[data-testid='send-button']", "button[aria-label*='Send']", "button[type='submit']"],
      placement: "toolbar-end",
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
      editorSelectors: ["div.ProseMirror[contenteditable='true']", "div[contenteditable='true']", "textarea", "p[data-placeholder]"],
      anchorSelectors: ["form", "[data-testid*='input']", "[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[type='submit']"],
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
      editorSelectors: ["rich-textarea [contenteditable='true']", "rich-textarea textarea", "[contenteditable='true']", "textarea"],
      anchorSelectors: ["rich-textarea", ".input-area-container", "form", "[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[aria-label*='提交']", "button[type='submit']"],
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
      editorSelectors: ["textarea[placeholder]", "textarea", "[contenteditable='true']"],
      anchorSelectors: ["form", "textarea[placeholder]", "[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Submit']", "button[aria-label*='Send']", "button[type='submit']"],
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
      editorSelectors: ["textarea", "[contenteditable='true']"],
      anchorSelectors: ["form", "textarea", "[contenteditable='true']"],
      sendSelectors: ["button[aria-label*='Send']", "button[type='submit']"],
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
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "doubao",
      hosts: ["doubao.com", "www.doubao.com"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "qwen",
      hosts: ["www.qianwen.com", "qianwen.aliyun.com", "tongyi.aliyun.com", "qwen.ai", "chat.qwen.ai"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "kimi",
      hosts: ["kimi.com", "www.kimi.com", "kimi.moonshot.cn"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "zhipu",
      hosts: ["chatglm.cn", "www.chatglm.cn"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "wenxin",
      hosts: ["yiyan.baidu.com", "wenxin.baidu.com"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "yuanbao",
      hosts: ["yuanbao.tencent.com"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "spark",
      hosts: ["xinghuo.xfyun.cn", "spark.xfyun.cn"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "hailuo",
      hosts: ["hailuoai.com", "hailuoai.video"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    },
    {
      id: "baichuan",
      hosts: ["ying.baichuan-ai.com", "www.baichuan-ai.com"],
      turnSelectors: COMMON_CHAT_TURN_SELECTORS,
      roleFromElement: roleFromCommonElement
    }
  ].map((provider) => ({ ...DEFAULT_PROVIDER_CONTROLS, ...provider })),
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
})();
