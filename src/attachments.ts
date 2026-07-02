export interface AttachmentView {
  index: number;
  kind: "image" | "file";
  label: string;
  path: string;
}

const ATTACHMENT_LINE = /^(Image|File|Files mentioned):\s+(.+?)\s+\(((?:\/|~\/|[A-Za-z]:\\|https?:\/\/)[^)]+)\)$/i;
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export function attachmentViewsFromText(text: string): AttachmentView[] {
  const views: AttachmentView[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(ATTACHMENT_LINE);
    if (!match) continue;
    const kind = match[1].toLowerCase() === "image" ? "image" : "file";
    views.push({
      index: views.length,
      kind,
      label: match[2].trim(),
      path: match[3].trim()
    });
  }
  return views;
}

export function attachmentMarkdownText(text: string, observationId = "obs-1"): string {
  const attachments = attachmentViewsFromText(text);
  if (attachments.length === 0) return text;
  const byPath = new Map(attachments.map((attachment) => [attachment.path, attachment]));
  return text.split(/\r?\n/).map((line) => {
    const match = line.trim().match(ATTACHMENT_LINE);
    const attachment = match ? byPath.get(match[3].trim()) : undefined;
    if (!attachment) return line;
    const url = attachment.path.startsWith("http://") || attachment.path.startsWith("https://")
      ? attachment.path
      : `/attachments?observationId=${encodeURIComponent(observationId)}&index=${attachment.index}`;
    return attachment.kind === "image"
      ? `![${attachment.label}](${url})`
      : `[${attachment.label}](${url})`;
  }).join("\n");
}

export function isRenderableImagePath(path: string): boolean {
  const clean = path.split(/[?#]/u)[0].toLowerCase();
  const extension = clean.match(/\.[^.\/\\]+$/u)?.[0];
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}
