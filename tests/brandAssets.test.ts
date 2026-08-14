import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function pngSize(path: string) {
  const bytes = await readFile(resolve(process.cwd(), path));
  expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("brand asset derivatives", () => {
  it("keeps the selected terminal asset at its canonical 2.2:1 ratio", async () => {
    expect(await pngSize("public/brand/editorial-terminal.png")).toEqual({
      width: 106,
      height: 48,
    });
  });

  it("ships deliberate favicon and social-card sizes", async () => {
    const [favicon16, favicon32, favicon64, apple, social] = await Promise.all([
      pngSize("public/favicon-16.png"),
      pngSize("public/favicon-32.png"),
      pngSize("public/favicon.png"),
      pngSize("public/apple-touch-icon.png"),
      pngSize("public/og.png"),
    ]);

    expect(favicon16).toEqual({ width: 16, height: 16 });
    expect(favicon32).toEqual({ width: 32, height: 32 });
    expect(favicon64).toEqual({ width: 64, height: 64 });
    expect(apple).toEqual({ width: 180, height: 180 });
    expect(social).toEqual({ width: 1200, height: 630 });
  });

  it("references only the new favicon family and complete social metadata", async () => {
    const indexHtml = await readFile(resolve(process.cwd(), "index.html"), "utf8");

    expect(indexHtml).not.toContain("favicon.svg");
    expect(indexHtml).toContain("%BASE_URL%favicon-32.png");
    expect(indexHtml).toContain("%BASE_URL%favicon-16.png");
    expect(indexHtml).toContain("%BASE_URL%apple-touch-icon.png");
    expect(indexHtml).toContain('property="og:image:width" content="1200"');
    expect(indexHtml).toContain('property="og:image:height" content="630"');
    expect(indexHtml).toContain('name="twitter:image:alt"');
  });
});
