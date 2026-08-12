import { describe, expect, it } from "vitest";
import { routerBasename, withBasePath } from "@/lib/basePath";

describe("GitHub Pages base paths", () => {
  it("keeps root-hosted assets unchanged", () => {
    expect(withBasePath("/images/editorial/cover-fold.webp", "/")).toBe(
      "/images/editorial/cover-fold.webp",
    );
    expect(routerBasename("/")).toBe("/");
  });

  it("prefixes assets and routes for a repository Pages site", () => {
    expect(
      withBasePath("/images/editorial/cover-fold.webp", "/personal-website/"),
    ).toBe("/personal-website/images/editorial/cover-fold.webp");
    expect(routerBasename("/personal-website/")).toBe("/personal-website");
  });

  it("does not rewrite remote or protocol-relative media", () => {
    expect(withBasePath("https://example.com/image.jpg", "/personal-website/")).toBe(
      "https://example.com/image.jpg",
    );
    expect(withBasePath("//cdn.example.com/image.jpg", "/personal-website/")).toBe(
      "//cdn.example.com/image.jpg",
    );
  });
});
