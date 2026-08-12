import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { about, contact, dispatches, projects, resume, siteMeta } from "@/lib/content";
import {
  AboutSchema,
  ContactSchema,
  DispatchSchema,
  ProjectSchema,
  ResumeSchema,
  SiteMetaSchema,
} from "@/lib/content-types";

describe("content integrity", () => {
  it("all content passes its schema", () => {
    SiteMetaSchema.parse(siteMeta);
    AboutSchema.parse(about);
    ProjectSchema.array().min(1).parse(projects);
    ResumeSchema.parse(resume);
    ContactSchema.parse(contact);
    DispatchSchema.array().min(2).parse(dispatches);
  });

  it("every resume entry carries a margin note (the hover-aside requirement)", () => {
    for (const entry of resume.entries) {
      expect(entry.marginalia.text.length).toBeGreaterThan(10);
      expect(entry.marginalia.ariaLabel.length).toBeGreaterThan(5);
    }
  });

  it("all referenced images exist on disk", async () => {
    const publicDir = join(process.cwd(), "public");
    const sources = [
      ...about.photos.map((p) => p.src),
      ...projects.flatMap((p) => (p.image ? [p.image.src] : [])),
    ];
    expect(sources.length).toBeGreaterThan(5);
    await Promise.all(sources.map((src) => access(publicDir + src)));
  });

  it("email link is present and first among contacts", () => {
    expect(contact.links[0]?.kind).toBe("email");
    expect(contact.links[0]?.href).toMatch(/^mailto:/);
  });

  it("project files stay uniquely addressable with two explicit features", () => {
    const ids = projects.map((project) => project.id);
    const featureOrders = projects.flatMap((project) =>
      project.featureOrder === undefined ? [] : [project.featureOrder],
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect([...featureOrders].sort()).toEqual([1, 2]);
    expect(new Set(featureOrders).size).toBe(featureOrders.length);
  });

  it("every project image carries its own useful description", () => {
    for (const project of projects) {
      if (!project.image) continue;
      expect(project.image.alt.length).toBeGreaterThan(20);
    }
  });
});
