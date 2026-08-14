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

describe("BookScene stack reveal", () => {
  it("arrives at full thickness the frame a hidden stack is revealed", () => {
    // A boundary flip reveals a stack that sat hidden at near-zero scale.
    // Landing on that degenerate, still-growing box is the brief gray flash
    // on the freshly revealed page: the reveal must snap to the resting
    // state, with the damp reserved for on-screen thickness changes.
    expect(stackSource).toMatch(
      /shownCount\.current === 0 && count > 0[\s\S]*?m\.scale\.z = targetScale;/,
    );
    expect(stackSource).toContain("setPaperMaterialActivity(topMat, 0)");
  });
});

describe("BookScene scene graph derives from committed state", () => {
  // The motion object is a mutable mirror written by an effect AFTER each
  // commit. A render that reads it can catch it mid-update: the leaf unmounts
  // while the landing stack is still computed hidden, and at the cover/back
  // boundary nothing sits beneath — the landed page flashes the gray void for
  // a frame. Leaf mounting and stack counts must come from the `sheet` and
  // `current` props (commit-consistent), never from motion at render time.
  const leafStart = source.indexOf("function Leaf(");
  const leafEnd = source.indexOf("const FAST_LEAF_SEGMENTS", leafStart);
  const leafSource = source.slice(leafStart, leafEnd);
  const sceneStart = source.indexOf("export function BookScene(");
  const sceneSource = source.slice(sceneStart);

  it("mounts the leaf and its faces from the committed sheet prop", () => {
    expect(leafSource).toContain("if (sheet === null) return null;");
    expect(leafSource).toContain('sheet !== null ? pageKey(sheet, "recto")');
    expect(leafSource).toContain('sheet !== null ? pageKey(sheet + 1, "verso")');
    expect(leafSource).not.toMatch(/motion\.leaf !== null \? pageKey/);
  });

  it("computes stack counts and tops from committed props", () => {
    const countsStart = sceneSource.indexOf("const riffleStacks");
    const countsEnd = sceneSource.indexOf("return (", countsStart);
    const countsSource = sceneSource.slice(countsStart, countsEnd);
    expect(countsSource).not.toContain("motion.leaf");
    expect(countsSource).not.toContain("motion.current");
    expect(countsSource).toContain("sheet !== null");
  });
});
