import { MediaItemSchema, type MediaItem } from "./types";

// These are exact, verified posts from @alan_tai1. They keep the library useful
// when the X API is not configured or temporarily unavailable.
export const RECENT_X_FALLBACKS: MediaItem[] = MediaItemSchema.array().parse([
  {
    id: "x:2087075973703578015",
    source: "x",
    kind: "post",
    title: "Trying to drain Codex",
    excerpt:
      "it's genuinely so hard to drain codex usage, i've been trying to get it down to 0% but sol is too efficient",
    url: "https://x.com/alan_tai1/status/2087075973703578015",
    author: "@alan_tai1",
    publishedAt: "2026-08-11T07:17:42.784Z",
    tags: ["AI", "Codex"],
    isFallback: true,
  },
  {
    id: "x:2086583672594129278",
    source: "x",
    kind: "post",
    title: "Diffusion models finally make sense",
    excerpt: "diffusion models finally make sense",
    url: "https://x.com/alan_tai1/status/2086583672594129278",
    author: "@alan_tai1",
    publishedAt: "2026-08-09T22:41:29.053Z",
    relatedLinks: [
      {
        label: "Step-by-Step Diffusion: An Elementary Tutorial",
        url: "https://arxiv.org/abs/2406.08929",
      },
    ],
    tags: ["AI", "Reading"],
    isFallback: true,
  },
  {
    id: "x:2085848089638867196",
    source: "x",
    kind: "post",
    title: "A writing signal",
    excerpt:
      "the best signal that your writing is good is if chatgpt tells you that it's bad",
    url: "https://x.com/alan_tai1/status/2085848089638867196",
    author: "@alan_tai1",
    publishedAt: "2026-08-07T21:58:32.410Z",
    tags: ["Writing", "AI"],
    isFallback: true,
  },
  {
    id: "x:2085594491633930632",
    source: "x",
    kind: "post",
    title: "Will AI ever be able to read this font?",
    excerpt: "will AI ever be able to read this font?",
    url: "https://x.com/alan_tai1/status/2085594491633930632",
    author: "@alan_tai1",
    publishedAt: "2026-08-07T05:10:49.934Z",
    tags: ["AI", "Typography"],
    isFallback: true,
  },
]);

// Curated sources are intentionally descriptive only. `note` stays absent until
// Alan supplies a personal take, keeping source claims separate from commentary.
export const CURATED_MEDIA_SEED: MediaItem[] = MediaItemSchema.array().parse([
  {
    id: "library:x:2080711672159998357",
    source: "x",
    kind: "post",
    title: "Chip design from the bottom up",
    url: "https://x.com/alan_tai1/status/2080711672159998357",
    author: "@alan_tai1",
    publishedAt: "2026-07-24T17:48:15.053Z",
    tags: ["Hardware", "Design"],
  },
  {
    id: "library:x:2081038013652517073",
    source: "x",
    kind: "post",
    title: "Corgi and the regulatory moat",
    url: "https://x.com/mohashrafmohsen/status/2081038013652517073",
    author: "@mohashrafmohsen",
    publishedAt: "2026-07-25T15:25:00.928Z",
    tags: ["Startups", "Regulation"],
  },
  {
    id: "library:sequoia:services-new-software",
    source: "web",
    kind: "article",
    title: "Services: The New Software",
    excerpt:
      "The next $1T company will be a software company masquerading as a services firm.",
    url: "https://sequoiacap.com/article/services-the-new-software/",
    author: "Julien Bek",
    publishedAt: "2026-03-05T00:00:00.000Z",
    tags: ["AI", "Startups", "Services"],
  },
  {
    id: "library:youtube:LXX_qOA5D8E",
    source: "youtube",
    kind: "video",
    title: "I Studied 500+ Gamified Apps (Here's What Actually Works)",
    url: "https://www.youtube.com/watch?v=LXX_qOA5D8E",
    author: "Tim Gabe",
    image: {
      src: "https://i.ytimg.com/vi/LXX_qOA5D8E/hqdefault.jpg",
      alt: "Thumbnail for I Studied 500+ Gamified Apps",
      width: 480,
      height: 360,
    },
    tags: ["Design", "Games"],
  },
  {
    id: "library:youtube:mRdXyRYX1aM",
    source: "youtube",
    kind: "video",
    title: "The Art of Boring Startups That Raise Millions",
    url: "https://www.youtube.com/watch?v=mRdXyRYX1aM",
    author: "Rho",
    image: {
      src: "https://i.ytimg.com/vi/mRdXyRYX1aM/hqdefault.jpg",
      alt: "Thumbnail for The Art of Boring Startups That Raise Millions",
      width: 480,
      height: 360,
    },
    tags: ["Startups", "Business"],
  },
  {
    id: "library:youtube:0FL_1hS9OeM",
    source: "youtube",
    kind: "video",
    title: "Why Postgres Is Winning",
    url: "https://www.youtube.com/watch?v=0FL_1hS9OeM",
    author: "PawelCodeStuff",
    image: {
      src: "https://i.ytimg.com/vi/0FL_1hS9OeM/hqdefault.jpg",
      alt: "Thumbnail for Why Postgres Is Winning",
      width: 480,
      height: 360,
    },
    tags: ["Databases", "Engineering"],
  },
  {
    id: "library:a16z:software-eating-world",
    source: "web",
    kind: "article",
    title: "Why Software Is Eating the World",
    excerpt: "Software is eating the world.",
    url: "https://a16z.com/why-software-is-eating-the-world/",
    author: "Marc Andreessen",
    publishedAt: "2011-08-20T00:00:00.000Z",
    tags: ["Software", "Business"],
  },
]);

export const LOCAL_PHOTO_SEED: MediaItem[] = MediaItemSchema.array().parse([
  {
    id: "photo:great-wall",
    source: "local",
    kind: "photo",
    title: "The long way up",
    url: "/about",
    image: {
      src: "/images/about/alan-great-wall.webp",
      alt: "Alan taking a selfie on the Great Wall under a clear blue sky",
      width: 1600,
      height: 2134,
    },
    tags: ["Travel", "China"],
  },
  {
    id: "photo:hutong",
    source: "local",
    kind: "photo",
    title: "Lantern logic",
    url: "/about",
    image: {
      src: "/images/about/alan-hutong.webp",
      alt: "Alan standing in a lantern-lined hutong",
      width: 1600,
      height: 2125,
    },
    tags: ["Travel", "China"],
  },
  {
    id: "photo:mountain",
    source: "local",
    kind: "photo",
    title: "Cloud level",
    url: "/about",
    image: {
      src: "/images/about/alan-mountain.webp",
      alt: "Alan in front of a misty green mountain",
      width: 1600,
      height: 2134,
    },
    tags: ["Travel", "Outdoors"],
  },
  {
    id: "photo:shanghai",
    source: "local",
    kind: "photo",
    title: "Shanghai after dark",
    url: "/about",
    image: {
      src: "/images/about/alan-shanghai.webp",
      alt: "Alan in front of Shanghai's illuminated skyline at night",
      width: 1600,
      height: 2134,
    },
    tags: ["Travel", "Shanghai"],
  },
  {
    id: "photo:headshot",
    source: "local",
    kind: "photo",
    title: "Alan Tai",
    url: "/about",
    image: {
      src: "/images/about/alan-headshot.webp",
      alt: "Portrait of Alan wearing a navy suit and purple tie",
      width: 800,
      height: 800,
    },
    tags: ["Portrait"],
  },
]);

export const MEDIA_SEED: MediaItem[] = [
  ...RECENT_X_FALLBACKS,
  ...CURATED_MEDIA_SEED,
  ...LOCAL_PHOTO_SEED,
];

