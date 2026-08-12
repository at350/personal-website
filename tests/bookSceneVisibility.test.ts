import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src", "book3d", "BookScene.tsx"),
  "utf8",
);
const stackStart = source.indexOf("function Stack(");
const stackEnd = source.indexOf("/* Rect-area lights", stackStart);
const stackSource = source.slice(stackStart, stackEnd);

describe("BookScene stack visibility handoff", () => {
  it("commits stack visibility with its count before the next frame", () => {
    const meshOpening = stackSource.match(/<mesh\b[\s\S]*?\/>/)?.[0] ?? "";
    const rimOpening =
      stackSource.match(/<lineSegments\b[\s\S]*?>\s*<lineBasicMaterial/)?.[0] ??
      "";

    expect(meshOpening).toContain("visible={count > 0}");
    expect(rimOpening).toContain("visible={count > 0}");
    expect(stackSource).not.toMatch(/\b(?:m|outline)\.visible\s*=/);
  });
});
