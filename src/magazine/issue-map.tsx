import type { SpreadBinding } from "./spread-types";
import { SPREADS } from "./folio";
import { BackCover, Cover } from "@/spreads/Cover";
import { Contents } from "@/spreads/Contents";
import { EditorsLetter } from "@/spreads/EditorsLetter";
import { Profile } from "@/spreads/Profile";
import { ProjectsOpener } from "@/spreads/ProjectsOpener";
import { ProjectWell } from "@/spreads/ProjectWell";
import { Resume } from "@/spreads/Resume";
import { Library } from "@/spreads/Library";
import { Dispatches } from "@/spreads/Dispatches";
import { Letters } from "@/spreads/Letters";

/** id → component bindings; the flatplan itself lives in folio.ts. */
const BINDINGS: Record<string, Omit<SpreadBinding, "id">> = {
  cover: { Component: Cover, fullBleed: { verso: true, recto: true } },
  contents: { Component: Contents },
  letter: { Component: EditorsLetter },
  profile: { Component: Profile },
  features: { Component: ProjectsOpener },
  well: { Component: ProjectWell },
  resume: { Component: Resume },
  library: { Component: Library },
  dispatches: { Component: Dispatches },
  letters: { Component: Letters },
  back: { Component: BackCover, fullBleed: { verso: true, recto: true } },
};

export const ISSUE: readonly SpreadBinding[] = SPREADS.map((def) => {
  const binding = BINDINGS[def.id];
  if (!binding) throw new Error(`No spread component bound for "${def.id}"`);
  return { id: def.id, ...binding };
});
