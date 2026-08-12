import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { about, dispatches, projects, resume } from "@/lib/content";
import { Contents } from "@/spreads/Contents";
import { EditorsLetter } from "@/spreads/EditorsLetter";
import { Profile } from "@/spreads/Profile";
import { ProjectsOpener } from "@/spreads/ProjectsOpener";
import { ProjectWell } from "@/spreads/ProjectWell";

afterEach(cleanup);

const textOf = (element: ReactElement): string => {
  const { container, unmount } = render(element);
  const text = container.textContent?.replace(/\s+/g, " ").trim() ?? "";
  unmount();
  return text;
};

const readerProps = { mode: "reader" as const };

describe("editorial copy allocation", () => {
  it("gives the letter and following profile distinct copy", () => {
    const letter = textOf(<EditorsLetter face="verso" {...readerProps} />);
    const profile = textOf(<Profile face="verso" {...readerProps} />);

    expect(profile).not.toContain(about.heading);
    for (const note of about.notes) expect(letter).not.toContain(note.text);
    for (const paragraph of about.paragraphs) expect(profile).not.toContain(paragraph);
  });

  it("keeps the contents page from preprinting the letter's thesis or signoff", () => {
    const contents = textOf(
      <MemoryRouter>
        <>
          <Contents face="verso" {...readerProps} />
          <Contents face="recto" {...readerProps} />
        </>
      </MemoryRouter>,
    );

    expect(contents).not.toContain(about.heading);
    expect(contents).not.toContain(about.pullQuote);
  });

  it("uses summaries in the project index and details in the following well", () => {
    const index = textOf(<ProjectsOpener face="recto" {...readerProps} />);
    const architec = textOf(
      <MemoryRouter>
        <ProjectWell face="verso" {...readerProps} />
      </MemoryRouter>,
    );
    const greenchain = textOf(
      <MemoryRouter>
        <ProjectWell face="recto" {...readerProps} />
      </MemoryRouter>,
    );

    expect(index).toContain(projects[0].summary);
    expect(index).toContain(projects[1].summary);
    expect(index).not.toContain(projects[0].detail);
    expect(index).not.toContain(projects[1].detail);
    expect(architec).toContain(projects[0].detail);
    expect(architec).not.toContain(projects[0].summary);
    expect(greenchain).toContain(projects[1].detail);
    expect(greenchain).not.toContain(projects[1].summary);
    for (const project of projects.slice(2)) {
      expect(greenchain).not.toContain(project.name);
    }
  });

  it("does not give every current resume entry the same opening verb", () => {
    const openings = resume.entries
      .filter((entry) => entry.kind === "current")
      .map((entry) => entry.summary.split(/\s+/, 1)[0]?.toLocaleLowerCase());
    expect(new Set(openings).size).toBe(openings.length);
  });

  it("keeps dispatch decks out of their body copy", () => {
    for (const dispatch of dispatches) {
      for (const paragraph of dispatch.body) {
        expect(paragraph.toLocaleLowerCase()).not.toContain(
          dispatch.dek.toLocaleLowerCase(),
        );
      }
    }
  });
});
