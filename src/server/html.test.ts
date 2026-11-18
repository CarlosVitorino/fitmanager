import { describe, expect, it } from "vitest";
import { cleanHtml, htmlPreview, isBlankHtml } from "./html";

describe("cleanHtml", () => {
  it("keeps editor formatting", () => {
    expect(cleanHtml("<p><strong>Squat</strong> <em>3×8</em></p><ul><li>one</li></ul>")).toBe(
      "<p><strong>Squat</strong> <em>3×8</em></p><ul><li>one</li></ul>",
    );
  });
  it("removes scripts, handlers and javascript links", () => {
    const out = cleanHtml(
      `<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">a</a><img src=x onerror=alert(1)></p>`,
    )!;
    expect(out).not.toMatch(/script|onclick|onerror|javascript|<img/);
  });
  it("makes links open safely in a new tab", () => {
    expect(cleanHtml('<p><a href="https://example.com">x</a></p>')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
    );
  });
  it("treats empty editor output as nothing", () => {
    expect(cleanHtml("<p></p>")).toBeNull();
    expect(isBlankHtml("<p>&nbsp; </p>")).toBe(true);
  });
});

describe("htmlPreview", () => {
  it("flattens to text and truncates", () => {
    expect(htmlPreview("<p>Hello <b>there</b></p><p>Second &amp; last</p>", 20)).toBe("Hello there Second…");
  });
});
