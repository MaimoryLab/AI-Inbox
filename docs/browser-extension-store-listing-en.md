# Agent Memory Lab Browser Extension: Store Listing Draft

This document is the English release copy for external testers and future Chrome Web Store submission. It should stay aligned with the Chinese README, privacy note, and AI site validation log.

## One-line Description

Bring local, reviewable memory into ChatGPT, Claude, Gemini, Perplexity, and your everyday web research.

## Short Description

Agent Memory Lab adds a local-first memory layer to your browser. Capture webpages, review memory candidates, and surface relevant local memories near AI input boxes before you ask.

## Long Description

Agent Memory Lab is a browser extension for people who work across AI assistants, research pages, documentation, and local projects.

Instead of silently uploading everything you see, the extension turns the current page or AI conversation into a structured `PageCapture`: page title, URL, selected text, visible headings, candidate memories, candidate lessons, privacy hints, and AI-page diagnostics. Content is sent to your local Agent Memory Lab workbench first, where you can review, edit, approve, or dismiss it before it becomes long-term memory.

On supported AI pages, the extension can show relevant local memories near the input box so you can reuse project context while writing prompts. The current supported-site structure covers ChatGPT, Claude, Gemini, Perplexity, Grok, and DeepSeek, with diagnostics to help validate and repair site-specific selectors as these products change.

## Core Features

- Save the current webpage to a local review queue.
- Capture selected text, page title, URL, description, and visible headings.
- Review candidate memories and lessons before they are saved long-term.
- Show relevant local memories near AI input boxes on supported AI sites.
- Insert or copy recalled memories into the current AI prompt.
- Use the side panel to inspect page type, privacy hints, connection status, and AI-page diagnostics.
- Copy AI diagnostics for site validation without sharing cookies, passwords, or hidden page source.
- Open the local Agent Memory Lab workbench and Skill page directly from the extension.

## What Makes It Different

Many memory tools optimize for cloud sync and automatic capture. Agent Memory Lab is designed for local-first, human-reviewed memory. The extension can recognize useful context, but long-term memory writes still go through the local workbench review queue.

This is especially useful for users who want AI assistants to remember project context without giving up control over what becomes durable memory.

## Permission Justification

| Permission | Why it is needed | User-visible behavior |
| --- | --- | --- |
| `activeTab` | Read the active page title, URL, selected text, and visible page context after user action | Used when the user opens the popup, side panel, or saves the current page |
| `tabs` | Open the local workbench and identify the current tab | Used by buttons such as “Workbench” and “Skill” |
| `storage` | Store local API settings and recent capture history | Keeps the API URL, viewer URL, optional secret, and recent records in the browser |
| `sidePanel` | Provide the browser side panel | Shows page context, candidates, diagnostics, and local connection status |
| `contextMenus` | Provide a right-click save action | Lets users send the current page to local review from the context menu |
| `scripting` | Reserved for controlled site adaptation during local development | Used only for extension functionality and future supported-site refinements |
| Host access | Recognize page types and show local memory hints on supported AI sites | AI memory hints appear only on supported AI pages; other pages are captured only when the user acts |

## Privacy Summary

Agent Memory Lab is local-first by default. The extension connects to your local Agent Memory Lab API, usually `http://localhost:3111`, and opens your local viewer, usually `http://localhost:3113`.

The extension does not intentionally collect browser history, cookies, passwords, payment details, hidden form fields, or unopened pages. It does not send captured content to a third-party cloud service by default.

Data that may be processed after user action includes:

- Page title, URL, host, and page type.
- Meta description and visible headings.
- User-selected text.
- Visible snippets from supported AI conversations.
- Current prompt draft text on supported AI pages.
- Candidate memories, candidate lessons, and privacy hints.
- AI diagnostics such as provider, editor-found state, matched selector, prompt length, and turn count.

Long-term memory creation requires review in the local Agent Memory Lab workbench.

## Screenshots Needed Before Public Submission

- Extension icons are prepared in PNG sizes 16, 32, 48, and 128 under `browser-extension/icons/`.
- Dashboard / home page of the local workbench.
- Skill management page.
- Browser extension side panel on a supported AI page.
- Review queue in the memory page.
- Optional: AI input-box memory hint with non-sensitive demo data.

Do not use screenshots containing private memories, personal identity details, private chats, API keys, or real user documents.

## Pre-release Checklist

- `npm run check:delivery` passes.
- `artifacts/agent-memory-lab-extension.zip` is generated.
- `docs/browser-extension-ai-validation-cn.md` has real-site validation notes for the target AI products.
- The privacy policy is published at a stable URL.
- Store screenshots use non-sensitive demo data.
- Permission descriptions match `browser-extension/manifest.json`.
- The extension has a clear support/contact path.

## Support Copy

If the memory hint does not appear on an AI page, open the extension side panel and check “AI Page Status.” If the editor is not found, click “Copy Diagnostics” and include the copied JSON in your feedback. The diagnostics are intended to help repair supported-site selectors and do not include cookies or passwords.
