# Design QA — Editorial Terminal Identity

## Evidence

- Source visual truth: `/Users/alantai/Documents/personal-website/artifacts/design-qa/source-option-3.png`
  - Original generated result: `/Users/alantai/.codex/generated_images/019ffed4-f4c4-72c1-bdfb-82f6d01f15a8/exec-dd2869de-0a85-4c77-8007-2645cb529ac8.png`
  - Source pixels: 1536 × 1024. This is an identity application sheet rather than a browser viewport.
- Browser-rendered implementation:
  - Desktop cover: `/Users/alantai/Documents/personal-website/artifacts/design-qa/cover-desktop.png`
  - Desktop back cover: `/Users/alantai/Documents/personal-website/artifacts/design-qa/back-desktop.png`
  - Mobile reader cover: `/Users/alantai/Documents/personal-website/artifacts/design-qa/cover-mobile.png`
  - Mobile reader back cover: `/Users/alantai/Documents/personal-website/artifacts/design-qa/back-mobile.png`
  - Social card: `/Users/alantai/Documents/personal-website/public/og.png`
- Combined full-view and focused comparison: `/Users/alantai/Documents/personal-website/artifacts/design-qa/comparison-full.png`

## Viewports and normalization

- Desktop: 1280 × 720 CSS px, DPR 1; screenshots are 1280 × 720 pixels.
- Mobile reader: 390 × 844 CSS px, DPR 1; screenshots are 390 × 844 pixels.
- Social card: 1200 × 630 CSS px, DPR 1; output is 1200 × 630 pixels.
- Source: inspected at its native 1536 × 1024 pixels, then scaled proportionally inside the combined comparison. The source is a brand board, so page-layout parity would be false precision. The comparison is normalized around the shared wordmark gesture: Tanker letterforms, terminal dimensions, clear gap, baseline registration, and palette.

## States checked

- Closed-book cover at rest.
- Final back cover at rest after keyboard navigation with `End`.
- Reader-mode cover and back cover at 390 px width.
- Static social preview at 1200 × 630.
- Favicon derivatives at 64, 32, and 16 px.
- Reader SplitText entrance contract and capture-farm structural parity through automated tests.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: Tanker remains the live display face, preserving the selected source's heavy condensed proportions. Server Mono remains the metadata face. The terminal is excluded from SplitText so the text animation cannot duplicate or destroy it.
- Spacing and layout rhythm: one shared optical specification is used everywhere: terminal width `0.44cap`, height `0.20cap`, clear gap `0.15cap`, baseline aligned. The source board itself varies these ratios by scale; the normalized implementation intentionally removes that inconsistency. No wrapping, clipping, or overlap appears on the desktop cover, compact back mark, or mobile reader.
- Colors and visual tokens: the live site, README, and colophon now agree on white `#FFFFFF`, ink `#0E0E0C`, and red `#D7261E`. Every wordmark terminal uses the same selected raster asset, and the social card and favicon family are derived from the same direction.
- Image quality and asset fidelity: the terminal is a real project asset rather than a pseudo-element or CSS polygon. It remains clean at display, compact, social, and favicon scales. No inline or handcrafted SVG substitute was introduced.
- Copy and content: cover and social-card copy remain unchanged. Social metadata now declares the absolute image URL, dimensions, type, and alt text for Open Graph and Twitter.
- Responsiveness: checked at 1280 × 720 and 390 × 844. The terminal stays attached to the I and the compact mark remains centered.
- Accessibility: the terminal is decorative and `aria-hidden`; the semantic `h1` remains live text. Keyboard navigation to the final spread still works.
- Interactions and runtime: cover and back navigation were exercised in the browser. Browser console errors checked: none.

## Comparison history

- Pass 1: the combined full-view and focused comparison found no P0/P1/P2 mismatch. The slight difference between the source board's three terminal sizes and the implementation is intentional normalization, not drift. No post-comparison visual fix was required.

## Implementation checklist

- [x] Shared terminal asset and component.
- [x] Cover, back cover, and entry loader migrated off the triangle.
- [x] Legacy triangle pseudo-element removed.
- [x] Social preview and favicon family regenerated.
- [x] Mobile and desktop browser checks completed.
- [x] Tests, lint, and production build passed.

## Follow-up polish

- P3: if a future identity pass prefers the quieter full-size source ratio, reduce the shared terminal from `0.44cap × 0.20cap` to roughly `0.40cap × 0.18cap`; do not add per-context overrides.

final result: passed
