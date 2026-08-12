# Newsmag section categories

2026-08-11. Approved in conversation with Alan.

## Goal

Relabel the issue's sections with the five categories from Alan's old
newsmagazine — News, Features, Opinion, Arts & Ent, Sports — mapped
content-true onto the existing flatplan. Constraint from Alan: sections
must not jump around; each category appears once, contiguous, in page
order.

## Mapping

| Pages | Spread            | Running head                        |
| ----- | ----------------- | ----------------------------------- |
| 02–03 | Contents          | CONTENTS (front matter, unchanged)  |
| 04–05 | Editor's letter   | THE EDITOR'S LETTER (front matter)  |
| 06–07 | The Profile       | NEWS                                |
| 08–11 | Projects + well   | FEATURES (unchanged)                |
| 12–13 | Annotated resume  | SPORTS                              |
| 14–15 | The Library       | ARTS & ENT                          |
| 16–17 | Dispatches        | OPINION                             |
| 18–19 | Letters & colophon| LETTERS (back matter, unchanged)    |

The editor's letter is front matter, not Opinion — that is what keeps
Opinion from appearing twice. The book reads: front matter → News →
Features → Sports → A&E → Opinion → letters page.

## Changes

1. `src/magazine/folio.ts` — swap `runningHead` for profile, resume,
   library, dispatches. Routes, page numbers, `label` piece titles all
   unchanged.
2. `src/spreads/Contents.tsx` — the departments ledger on the recto
   becomes the section index: 06 news · 08 features · 12 sports ·
   14 arts & ent · 16 opinion · 18 letters. Same lowercase mono ledger
   styling. The features rail on the verso keeps piece titles and deks.
3. Nothing else moves: cover lines stay piece titles, Library filter
   chips stay content-type filters.

## Out of scope

Reordering spreads, renaming routes, renaming piece titles.
