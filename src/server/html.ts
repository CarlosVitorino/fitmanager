import sanitizeHtml from "sanitize-html";

/**
 * Rich text from the editor is stored as HTML. Everything is sanitized on the server before it's
 * saved: only the formatting the editor offers survives, links get safe attributes, scripts and
 * styles are dropped. Output is rendered with set:html.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "hr",
    "code",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    h1: "h3",
    h2: "h3",
  },
};

export function cleanHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const html = sanitizeHtml(input, OPTIONS).trim();
  return isBlankHtml(html) ? null : html;
}

/** True for editor output with no actual text, like "<p></p>". */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, "") === "";
}

/** Plain-text preview of rich text, for lists. */
export function htmlPreview(html: string, max = 140): string {
  const text = sanitizeHtml(html.replace(/<\/(p|li|h3|h4)>/g, " "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
