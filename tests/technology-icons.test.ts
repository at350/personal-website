import { describe, expect, it } from "vitest";
import {
  technologyLogo,
  technologyMonogram,
} from "@/lib/technology-icons";

describe("project technology marks", () => {
  it("resolves official brand marks from the central catalog", () => {
    expect(technologyLogo("React")).toMatch(/^data:image\/svg\+xml/);
    expect(technologyLogo("TypeScript")).toMatch(/^data:image\/svg\+xml/);
  });

  it("gives methods and future labels a compact fallback", () => {
    expect(technologyLogo("User research")).toBeNull();
    expect(technologyMonogram("User research")).toBe("UR");
    expect(technologyMonogram("XGBoost")).toBe("XG");
  });
});
