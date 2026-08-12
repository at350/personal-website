import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("page sheen renderer parity", () => {
  const stylesheet = readFileSync(
    join(process.cwd(), "src", "styles", "book-stage.css"),
    "utf8",
  );

  it("puts the persistent sheen on the page surface captured by WebGL", () => {
    expect(stylesheet).toMatch(/\.page-face\s*\{[^}]*isolation:\s*isolate;/s);
    expect(stylesheet).toMatch(/\.page-face::before\s*\{/);
    expect(stylesheet).not.toContain(".ov-face:not(.ov-face--void)::before");
  });
});
