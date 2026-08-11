import type { SpreadBinding, SpreadFaceProps } from "./spread-types";
import { SPREADS } from "./folio";

function PlaceholderFace({ face }: SpreadFaceProps) {
  return (
    <div style={{ padding: "var(--page-pad)" }}>
      <p className="mono-label">{face} — in production</p>
    </div>
  );
}

/** id → component bindings. Spread modules are attached here as they land. */
const BINDINGS: Record<string, Omit<SpreadBinding, "id">> = {
  cover: { Component: PlaceholderFace },
  contents: { Component: PlaceholderFace },
  letter: { Component: PlaceholderFace },
  profile: { Component: PlaceholderFace },
  features: { Component: PlaceholderFace },
  well: { Component: PlaceholderFace },
  resume: { Component: PlaceholderFace },
  library: { Component: PlaceholderFace },
  dispatches: { Component: PlaceholderFace },
  letters: { Component: PlaceholderFace },
  back: { Component: PlaceholderFace },
};

export const ISSUE: readonly SpreadBinding[] = SPREADS.map((def) => {
  const binding = BINDINGS[def.id];
  if (!binding) throw new Error(`No spread component bound for "${def.id}"`);
  return { id: def.id, ...binding };
});
