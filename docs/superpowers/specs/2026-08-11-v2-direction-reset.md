# V2 direction reset — after user review
2026-08-11 · supersedes visual/branding sections of the v1 spec

## What the review said (verbatim themes)
Flip feels 2D-disguised-as-3D; no page/light physics; "Field Notes" branding
unchosen; pages static and bland; cheesy copy; random gradient shading;
transitions.dev unused; ugly favicon; beige/washi = AI-default palette; the
inspiration archive wasn't really used; never take the first or second design
instinct; dependencies welcome; hard work expected.

## Non-negotiables carried forward
Real interactive HTML content (resume marginalia, live library), semantic
routes, accessibility, reader fallback, verified-content-only rule.

## The reset

### Object & physics
WebGL book: three + @react-three/fiber (+ drei, maath). Pages are meshes with
real thickness; turning pages bend along a skeletal/shader curve; a key light
(warm, upper-left) + ambient fill; contact shadow under the book; paper
micro-normal so light *grazes*; specular band sweeps the turning leaf.
Textures for page faces are produced from the real DOM pages via html-to-image
at 2× and cached. At rest the flat spread swaps to the live DOM layer
(perfectly aligned, instant) so pages remain fully interactive websites.
Drag = pointer maps to leaf angle with velocity-carrying spring release
(maath/easing critically damped). Mobile + reduced motion: reader (no WebGL).

### Brand
Masthead = the name, as a drawn logotype: "ALAN TAI" set in Zodiak Black with
a designed ligature/cut (the crossbar of the A carries a red slit). Site title:
"Alan Tai". The word "magazine" never appears; the object speaks for itself.
Favicon/mark: a black folded-page glyph whose negative space reads as "A",
one red edge. No seals, no kanji garnish, no "Field Notes".

### Palette (from the user's saved covers: NYT Mag / Coverjunkie / scholastic press)
- Paper: #FFFFFF. Void behind the book: #FFFFFF (stark; separation by shadow only).
- Ink: #0E0E0C. Secondary ink: #55524C.
- Red: #E8351A (the only color; cover lines, folios-on-hover, marks).
- Hairlines: rgba(14,14,12,.14). NOTHING beige, NOTHING cream.

### Type
Zodiak (Black, Italic) stays for the logotype + feature display — used at
conceptual scale (12-20cqw, tight leading, set as image-like blocks).
Newsreader for prose. Apfel Grotezk for UI. Server Mono for folios/meta.
NEW: Tanker (Fontshare, FFL) — heavy condensed display for cover lines and
section numerals, the scholastic-newsmagazine voice. Drop Shippori Mincho.

### Copy
Purge: price gag, "EVENTUALLY", "will return", "16 entries", staff-list joke
(replaced by a two-line colophon note), instructional sentences. Rule: if a
line explains or winks, delete it. Numbered mono labels only.

### Pages as pieces (each spread gets one signature interaction)
- Cover: logotype assembles letter-by-letter (SplitText chars), red slit
  breathes; pointer tilts the whole cover subtly in 3D (real mesh tilt).
- Contents: rows reveal full-bleed preview images on hover (clip-path wipe).
- Letter: marginalia refined (spring pop, transitions.dev tooltip timing).
- Profile: photo prints are draggable within the page (physics settle).
- Projects: index rows expand with layout animation (FLIP); live links.
- Resume: the ✳ notes get the "appear-delay, instant-exit" contract + digit
  pop-in dates.
- Library: filter chips with FLIP re-sort; number pop-in count.
- Letters: magnetic link rows; colophon set like a real imprint page.
- Transitions.dev patterns wired: number pop-in, text blur swap, icon swap,
  3D tilt w/ glare (plates), skeleton reveal (library images).

### Shading rules
No decorative gradients. Every shadow/highlight must be a consequence of the
lighting model (mesh) or a 1px hairline. DOM layer gets at most: one contact
shadow under the book, one gutter AO strip derived from the light direction.
