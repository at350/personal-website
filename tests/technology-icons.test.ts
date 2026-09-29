import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { existsSync } from "node:fs";
import { technologyLogo } from "@/lib/technology-icons";
import { ProjectTechnologyList } from "@/components/ProjectTechnologyList";
import { projects } from "@/lib/content";

describe("project technology marks", () => {
  it.each([
    "React", "TypeScript", "Python", "FastAPI", "Elasticsearch", "Firecrawl",
    "Supabase", "OpenAI Vision", "Hono", "LangGraph", "Prisma", "Mapbox",
    "Next.js", "Gemini", "Three.js", "Fusion 360",
  ])("resolves a bundled brand mark for %s", (label) => {
    expect(technologyLogo(label)).toMatch(/^data:image\/svg\+xml/);
  });

  it("renders methods and unknown labels without invented letter marks", () => {
    const html = renderToStaticMarkup(createElement(ProjectTechnologyList, {
      items: ["Multi-agent systems", "XGBoost", "User research", "Future tool"],
      label: "Methods",
    }));
    expect(html).toContain("Multi-agent systems");
    expect(html).toContain("XGBoost");
    expect(html).not.toContain("proj-tech__mark");
    expect(html).not.toContain("<img");
  });

  it("provides a local illustration for every project", () => {
    for (const project of projects) {
      expect(project.image, project.name).toBeDefined();
      expect(existsSync(`public${project.image!.src}`), project.name).toBe(true);
    }
  });
});
