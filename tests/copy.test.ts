import { describe, expect, it } from "vitest";
import { distinctExcerpt } from "@/lib/copy";

describe("editorial copy helpers", () => {
  it("suppresses an excerpt that repeats its title", () => {
    expect(
      distinctExcerpt(
        "Diffusion models finally make sense",
        "diffusion models finally make sense.",
      ),
    ).toBeUndefined();
  });

  it("suppresses an excerpt contained by its title", () => {
    expect(
      distinctExcerpt(
        "Why Software Is Eating the World",
        "Software is eating the world.",
      ),
    ).toBeUndefined();
  });

  it("preserves an excerpt that adds new information", () => {
    const excerpt = "The full post adds a separate observation.";
    expect(distinctExcerpt("A short title", excerpt)).toBe(excerpt);
  });
});
