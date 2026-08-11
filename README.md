# Alan Tai | Field Notes

A semantic personal site wrapped in an optional interactive magazine. The page
turn is a progressive enhancement. Every section also has a normal URL, useful
HTML, keyboard navigation, and a low-motion reading mode.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Quality checks

```bash
npm run lint
npm run build
npm test
```

## Content

- `lib/content.ts` holds the About, project, resume, contact, and dispatch data.
- `lib/media/seed.ts` holds the last-known-good media cabinet.
- `lib/media/feeds.ts` normalizes optional live feeds and falls back safely.
- `public/images` contains re-encoded, metadata-free site images.

The media library can update from these optional environment values:

```bash
X_BEARER_TOKEN=
X_USER_ID=
LETTERBOXD_RSS_URL=
SUBSTACK_RSS_URL=
SITE_URL=
```

No value is required. Without credentials or feed URLs, the verified bundled
items remain available. Source excerpts and Alan's own notes are separate fields
in the data model.

## Routes

- `/about`
- `/projects`
- `/resume`
- `/library`
- `/writing`
- `/writing/[slug]`
- `/contact`
- `/api/media`
- `/rss.xml`

## Design and interaction

The visual system uses locally bundled Shippori Mincho, Hanken Grotesk, and IBM
Plex Mono. The palette is warm paper, ink, and one vermilion accent. Desktop
visitors can drag or tap page edges; all visitors get explicit Previous and Next
controls. Reduced-motion users bypass page-turn animation. Mobile uses a single
page at a time, followed by the complete vertical reader.
