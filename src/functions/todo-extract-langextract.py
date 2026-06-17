#!/usr/bin/env python3
"""Optional LangExtract sidecar for AI Todo extraction.

Reads JSON from stdin and writes {"todos": [...]} to stdout. If langextract or
its model config is unavailable, exit non-zero so TypeScript can fall back to
the existing rules extractor.
"""

from __future__ import annotations

import json
import os
import sys
import textwrap


PROMPT = textwrap.dedent(
    """\
    Extract actionable todos from AI agent session text.
    Extract only explicit next actions, follow-ups, failed validations, blocked
    work, in-progress work, and completed work. Ignore background summaries,
    generic facts, read-only tool traces, and anything without a source quote.
    Use exact source text as extraction_text. Put fields in attributes:
    title, description, confidence, timeBucket, typeBucket, dedupeKey.
    timeBucket must be current, recent, or history.
    typeBucket must be pending, to_start, follow_up, in_progress, done, or processing.
    """
)


def load_langextract():
    try:
        import langextract as lx  # type: ignore

        return lx
    except Exception as exc:  # pragma: no cover - exercised by TS fallback
        raise SystemExit(f"langextract unavailable: {exc}") from exc


def main() -> int:
    payload = json.load(sys.stdin)
    blocks = payload.get("blocks") or []
    if not isinstance(blocks, list) or not blocks:
        print(json.dumps({"todos": []}, ensure_ascii=False))
        return 0

    lx = load_langextract()
    text = "\n\n".join(
        f"[obs:{b.get('sourceObservationId','')}]\n{b.get('text','')}"
        for b in blocks
        if isinstance(b, dict) and b.get("text")
    )
    if not text.strip():
        print(json.dumps({"todos": []}, ensure_ascii=False))
        return 0

    examples = [
        lx.data.ExampleData(
            text="[obs:obs_1]\n后续需要修复 CI 失败，并重新跑测试。",
            extractions=[
                lx.data.Extraction(
                    extraction_class="todo",
                    extraction_text="后续需要修复 CI 失败，并重新跑测试",
                    attributes={
                        "title": "修复 CI 失败并重新跑测试",
                        "description": "后续需要修复 CI 失败，并重新跑测试。",
                        "confidence": 0.9,
                        "timeBucket": "current",
                        "typeBucket": "follow_up",
                        "dedupeKey": "fix-ci-rerun-tests",
                    },
                )
            ],
        )
    ]
    model_id = os.environ.get("LANGEXTRACT_MODEL") or os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash"
    result = lx.extract(
        text_or_documents=text,
        prompt_description=PROMPT,
        examples=examples,
        model_id=model_id,
        extraction_passes=int(os.environ.get("LANGEXTRACT_PASSES", "2")),
        max_workers=int(os.environ.get("LANGEXTRACT_MAX_WORKERS", "4")),
        max_char_buffer=int(os.environ.get("LANGEXTRACT_MAX_CHAR_BUFFER", "1600")),
    )

    todos = []
    for item in getattr(result, "extractions", []):
        if getattr(item, "extraction_class", "") != "todo":
            continue
        quote = getattr(item, "extraction_text", "") or ""
        attrs = getattr(item, "attributes", {}) or {}
        interval = getattr(item, "char_interval", None)
        if not quote or interval is None:
            continue
        start = getattr(interval, "start_pos", None)
        end = getattr(interval, "end_pos", None)
        prefix = text[: start if isinstance(start, int) else text.find(quote)]
        obs_marker = prefix.rsplit("[obs:", 1)[-1].split("]", 1)[0] if "[obs:" in prefix else ""
        todos.append(
            {
                "title": attrs.get("title") or quote[:80],
                "description": attrs.get("description") or quote,
                "confidence": attrs.get("confidence", 0.6),
                "timeBucket": attrs.get("timeBucket", "recent"),
                "typeBucket": attrs.get("typeBucket", "pending"),
                "sourceSessionId": payload.get("sessionId"),
                "evidence": {
                    "sourceObservationId": obs_marker,
                    "quote": quote,
                    "charStart": start,
                    "charEnd": end,
                },
                "dedupeKey": attrs.get("dedupeKey") or quote.lower(),
            }
        )

    print(json.dumps({"todos": todos}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
