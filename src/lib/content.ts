import type {
  AboutContent,
  ContactContent,
  Dispatch,
  Project,
  ResumeContent,
  SiteMeta,
} from "./content-types";

export const siteMeta = {
  name: "Alan Tai",
  title: "Alan Tai",
  description:
    "Alan Tai is a Northwestern student building software, research, and early-stage products.",
  intro:
    "Use the index as a map, not an assignment. Start anywhere; the issue still reads front to back.",
  location: "Cupertino, Calif.",
  issue: {
    number: "01",
    title: "Issue No. 01",
    label: "A personal issue",
  },
} satisfies SiteMeta;


export const about = {
  eyebrow: "Notes from the editor",
  heading: "I like systems with people still visible inside them.",
  lede:
    "Hi, I'm Alan. I learned to make things in a student newsroom, long before I thought of software as the medium.",
  paragraphs: [
    "Reporting taught me to ask one more question before writing. Debate taught me to find the weakest assumption before someone else did. Those habits still shape how I approach software, research, and early-stage teams.",
    "I am happiest when a question crosses a boundary and I have to learn the neighboring vocabulary fast. The through line is less a medium than a standard: understand what is actually happening, then make the next step clearer.",
  ],
  pullQuote: "I just want to make things that work.",
  notes: [
    {
      label: "Start nearby",
      text: "i start with the people closest to the problem, then turn what repeats into something testable.",
    },
    {
      label: "Cross the seam",
      text: "i move between research, product, and implementation instead of treating the handoffs as somebody else's job.",
    },
    {
      label: "Show the reasoning",
      text: "i want the result legible enough for another person to question it.",
    },
    {
      label: "Use the thing",
      text: "i use the workflow in the real world before calling it finished.",
    },
  ],
  photos: [
    {
      src: "/images/about/alan-headshot.webp",
      alt: "Portrait of Alan Tai in a navy suit and purple tie outdoors.",
      caption: "The official version.",
      shape: "square",
    },
  ],
} satisfies AboutContent;

export const projects: readonly Project[] = [
  {
    id: "architec",
    name: "Architec",
    discipline: "Energy systems",
    year: "2026",
    featureOrder: 1,
    image: {
      src: "/images/projects/editorial/architec-study.webp",
      alt: "Conceptual Architec study with layered architectural planes, a black building volume, and a red translucent energy plane.",
    },
    summary:
      "An energy-audit tool that turns commercial-building utility bills into ranked upgrades, projected savings, and payback estimates.",
    detail:
      "The prototype combines Gemini OCR and weather-normalized regression with a Mapbox and Three.js building view for solar and thermal context.",
    stack: ["Next.js", "FastAPI", "Gemini", "Mapbox", "Three.js"],
    recognition:
      "Placed third overall and won the Appifex AI track at WildHacks.",
    links: [
      {
        kind: "devpost",
        label: "Devpost",
        href: "https://devpost.com/software/audit-kc5eiw",
      },
    ],
  },
  {
    id: "greenchain",
    name: "GreenChain",
    discipline: "Supply chains",
    year: "2026",
    featureOrder: 2,
    image: {
      src: "/images/projects/editorial/greenchain-study.webp",
      alt: "Conceptual GreenChain study with black paper nodes, taut threads, white platforms, and one red route through the network.",
    },
    summary:
      "A supply-chain sustainability platform that researches suppliers, estimates emissions, and makes relationships visible on a globe.",
    detail:
      "A multi-agent research swarm studies manufacturer pages, an XGBoost model estimates emissions, and Three.js maps the resulting network.",
    stack: ["TypeScript", "Python", "Multi-agent systems", "XGBoost", "Three.js"],
    recognition: "Won three sponsor tracks at HackPrinceton.",
    links: [
      {
        kind: "github",
        label: "GitHub",
        href: "https://github.com/at350/hackprinceton2026-sonar",
      },
      {
        kind: "devpost",
        label: "Devpost",
        href: "https://devpost.com/software/greenchain-1xglhu",
      },
    ],
  },
  {
    id: "prophis",
    name: "Prophis",
    discipline: "Public health",
    year: "2026",
    image: {
      src: "/images/projects/editorial/prophis-study.webp",
      alt: "Conceptual Prophis study with layered vellum timelines aligned by a red acetate tab.",
    },
    summary:
      "Patient-context intelligence that turns a fragmented history into a readable clinical timeline and a wider public-health picture.",
    detail:
      "The interface joins patient events with County Health Rankings and cohort-similarity signals, then supports a retrospective prevention review.",
    stack: ["React", "TypeScript", "Express", "Public-health data"],
    links: [
      {
        kind: "prototype",
        label: "Live prototype",
        href: "https://at350-yhack2026.vercel.app/",
      },
      {
        kind: "github",
        label: "GitHub",
        href: "https://github.com/at350/yhack2026",
      },
    ],
  },
  {
    id: "vox-vera",
    name: "Vox Vera",
    discipline: "Go-to-market strategy",
    year: "2026",
    image: {
      src: "/images/projects/editorial/vox-vera-study.webp",
      alt: "Conceptual Vox Vera study with black paper channels and white tokens converging on a red crop frame.",
    },
    summary:
      "A client strategy project that turned a dense channel dataset into a clearer acquisition and segmentation story.",
    detail:
      "I analyzed LinkedIn and SEO performance, then helped shape a client-facing strategy for legal, corporate, and academic audiences.",
    stack: ["Market research", "Segmentation", "SEO", "Go-to-market strategy"],
  },
  {
    id: "terrablade",
    name: "TerraBlade",
    discipline: "Accessible product design",
    year: "2025",
    image: {
      src: "/images/projects/editorial/terrablade-study.webp",
      alt: "Conceptual TerraBlade study with a pale clay slab, black guide rails, and a broad red pulling grip.",
    },
    summary:
      "An accessible clay slab-forming device built with Envision Unlimited for artists with physical disabilities.",
    detail:
      "From interviews and force constraints through CAD, fabrication, and user testing, the project treated accessibility as an engineering input, not a final check.",
    stack: ["Fusion 360", "User research", "Rapid prototyping", "Fabrication"],
  },
];

export const resume = {
  eyebrow: "Annotated resume",
  heading: "The work, plus what did not fit in the bullet point.",
  introduction:
    "This is a readable resume first. The margin notes add texture, but every role and result stands on its own without them.",
  education: [
    {
      institution: "Northwestern University",
      program: "Industrial Engineering and Artificial Intelligence",
      location: "Evanston, Illinois",
      details: ["Undergraduate studies", "GPA 3.98 / 4.00"],
    },
  ],
  entries: [
    {
      id: "ember-studios",
      kind: "current",
      organization: "Ember Studios",
      role: "Founding Intern",
      dates: "Apr 2026 to Present",
      summary:
        "Developing voice-agent infrastructure for personal memory preservation.",
      highlights: [
        "Works across backend systems, observability, and product reliability for a voice experience.",
      ],
      marginalia: {
        label: "A note from the build",
        ariaLabel: "Read a personal note about Ember Studios",
        text: "the work is nda'd. the question of what makes a machine conversation worth keeping is not.",
      },
    },
    {
      id: "wingrep",
      kind: "current",
      organization: "WingRep",
      role: "GTM Engineering Intern",
      dates: "May 2026 to Present",
      summary:
        "Running outbound, analytics, and content systems for a revenue-intelligence startup.",
      highlights: [
        "Connects research, workflow design, and direct customer conversations instead of treating them as separate jobs.",
      ],
      marginalia: {
        label: "From the call sheet",
        ariaLabel: "Read a personal note about WingRep",
        text: "the job title says engineering; the calendar says calls, copy, dashboards, and whatever broke.",
      },
    },
    {
      id: "meritus-labs",
      kind: "current",
      organization: "Meritus Labs",
      role: "Co-Founder",
      dates: "Apr 2026 to Present",
      summary:
        "Leading product discovery for an evaluation layer for teams that put AI in front of customers.",
      highlights: [
        "Runs product discovery and translates recurring reliability questions into testable evaluation workflows.",
      ],
      marginalia: {
        label: "Margin status",
        ariaLabel: "Read a personal note about Meritus Labs",
        text: "still early. doing the discovery before making a deck.",
      },
    },
    {
      id: "forge",
      kind: "research",
      organization: "Northwestern Network for Collaborative Intelligence",
      role: "FORGE Research Cohort",
      dates: "Jun 2026 to Present",
      summary:
        "Researching computational pathology for colorectal cancer with Northwestern Medicine.",
      highlights: [
        "Works with whole-slide histology and the problem of directing attention across very large medical images.",
      ],
      marginalia: {
        label: "At slide scale",
        ariaLabel: "Read a personal note about the FORGE Research Cohort",
        text: "whole-slide images are absurdly large. the hard part is knowing where to look.",
      },
    },
    {
      id: "italented",
      kind: "leadership",
      organization: "iTalented",
      role: "Founder and President",
      dates: "Sep 2024 to Present",
      summary:
        "Founded and leads a student computer science community centered on building, coaching, and competitions.",
      highlights: [
        "Mentors students through technical projects and competitive computer science.",
      ],
      marginalia: {
        label: "The good scoreboard",
        ariaLabel: "Read a personal note about iTalented",
        text: "the best wins on my record are ones my students got.",
      },
    },
    {
      id: "tamid",
      kind: "experience",
      organization: "TAMID Group",
      role: "Consultant",
      dates: "Apr 2026 to Jun 2026",
      summary:
        "Developed product and go-to-market recommendations for an early-stage legal AI client.",
      highlights: [
        "Turned customer, competitor, and positioning research into a practical client recommendation.",
      ],
      marginalia: {
        label: "Deck rule",
        ariaLabel: "Read a personal note about TAMID Group",
        text: "a deck is good if it makes the next decision easier.",
      },
    },
    {
      id: "teach-for-chicago-journalism",
      kind: "experience",
      organization: "Teach for Chicago Journalism, Northwestern Medill",
      role: "Administrative Aide",
      dates: "Sep 2025 to Jun 2026",
      summary:
        "Supported operations and student programming for a journalism education program.",
      highlights: [
        "Helped keep communications, schedules, and program logistics clear for instructors and students.",
      ],
      marginalia: {
        label: "Behind the byline",
        ariaLabel: "Read a personal note about Teach for Chicago Journalism",
        text: "turns out journalism education is mostly an ops problem.",
      },
    },
    {
      id: "thomson-reuters",
      kind: "experience",
      organization: "Thomson Reuters CS+Law Innovation Lab",
      role: "Research Fellow",
      dates: "Jan 2026 to May 2026",
      summary:
        "Built a research pipeline for evaluating how language models reason through structured legal tasks.",
      highlights: [
        "Combined structured outputs, embedding analysis, clustering, and rubric-based evaluation while keeping human review in the loop.",
      ],
      marginalia: {
        label: "Evaluation footnote",
        ariaLabel: "Read a personal note about the Thomson Reuters CS+Law Innovation Lab",
        text: "clustering became useful only after the rubric made disagreement inspectable.",
      },
    },
    {
      id: "lambda-strategy",
      kind: "experience",
      organization: "Lambda Strategy",
      role: "Consultant, Vox Vera client project",
      dates: "Jan 2026 to Mar 2026",
      summary:
        "Analyzed LinkedIn and SEO channel data, then translated the findings into a go-to-market strategy for Vox Vera.",
      highlights: [
        "Connected channel performance to distinct legal, corporate, and academic audiences.",
      ],
      marginalia: {
        label: "What survived",
        ariaLabel: "Read a personal note about the Vox Vera client project",
        text: "the chart that mattered wasn't the biggest one. it was the one that changed the plan.",
      },
    },
    {
      id: "el-estoque",
      kind: "leadership",
      organization: "El Estoque Newsmagazine",
      role: "Editor-in-Chief",
      dates: "May 2024 to Jun 2025",
      summary:
        "Led the reporting, editing, design, and production of a student newsmagazine.",
      highlights: [
        "Coordinated the editorial process from pitch and reporting through layout, fact-checking, and publication.",
      ],
      marginalia: {
        label: "Production-night inventory",
        ariaLabel: "Read a personal note about El Estoque Newsmagazine",
        text: "production nights were indesign crashes, missing photo credits, and half-eaten bags of chips.",
      },
    },
    {
      id: "monta-vista-debate",
      kind: "leadership",
      organization: "Monta Vista Debate",
      role: "President",
      dates: "Aug 2024 to Jun 2025",
      summary:
        "Led team operations and coached competitive preparation in Public Forum debate.",
      highlights: [
        "Coached cases, organized team operations, and kept competitive preparation rigorous and teachable.",
      ],
      marginalia: {
        label: "Crossfire lesson",
        ariaLabel: "Read a personal note about Monta Vista Debate",
        text: "good prep had to be rigorous enough to win and clear enough to teach.",
      },
    },
    {
      id: "uc-merced",
      kind: "research",
      organization: "University of California, Merced",
      role: "Undergraduate Researcher, Computer Vision",
      dates: "May 2023 to Apr 2024",
      summary:
        "Researched vision transformers for crop monitoring from drone imagery with Ross Greer.",
      highlights: [
        "The work was published at the 2024 International Conference on Computing and Data Science.",
      ],
      marginalia: {
        label: "First paper",
        ariaLabel: "Read a personal note about the University of California Merced research",
        text: "my first paper started with drone photos of winter crops.",
      },
    },
    {
      id: "uc-santa-barbara",
      kind: "research",
      organization: "University of California, Santa Barbara",
      role: "Undergraduate Researcher, Spiking Neural Networks",
      dates: "Jul 2024 to Aug 2024",
      summary:
        "Studied spiking neural networks and neuromorphic learning systems.",
      highlights: [
        "Explored how event-driven models change familiar assumptions about learning and computation.",
      ],
      marginalia: {
        label: "A different clock",
        ariaLabel: "Read a personal note about the University of California Santa Barbara research",
        text: "spiking neural nets: my first models that didn't behave like normal software.",
      },
    },
  ],
  recognition: [
    {
      title: "National Journalist of the Year",
      issuer: "Journalism Education Association",
      year: "2025",
      note: "A national portfolio award for reporting, writing, editing, and leadership.",
    },
    {
      title: "Public Forum National Champion",
      issuer: "National Speech & Debate Association",
      year: "2025",
      note: "One line here; years of cases and practice behind it.",
    },
    {
      title: "Five-time hackathon winner",
      issuer: "Collegiate hackathons",
      year: "Ongoing",
      note: "Rough ideas carried all the way to live judging.",
    },
  ],
} satisfies ResumeContent;

export const contact = {
  eyebrow: "Colophon",
  heading: "Send a note, a link, or a strange problem.",
  links: [
    {
      kind: "email",
      label: "Email",
      display: "alantai@u.northwestern.edu",
      href: "mailto:alantai@u.northwestern.edu",
      external: false,
    },
    {
      kind: "linkedin",
      label: "LinkedIn",
      display: "alan-tai-nu",
      href: "https://www.linkedin.com/in/alan-tai-nu/",
      external: true,
    },
    {
      kind: "github",
      label: "GitHub",
      display: "@at350",
      href: "https://github.com/at350",
      external: true,
    },
    {
      kind: "x",
      label: "X",
      display: "@alan_tai1",
      href: "https://x.com/alan_tai1",
      external: true,
    },
    {
      kind: "devpost",
      label: "Devpost",
      display: "alantai19",
      href: "https://devpost.com/alantai19",
      external: true,
    },
    {
      kind: "journalism",
      label: "Journalism archive",
      display: "Selected reporting",
      href: "https://alantaijournal.weebly.com/",
      external: true,
    },
  ],
} satisfies ContactContent;

export const dispatches = [
  {
    id: "why-a-magazine",
    status: "Site sample",
    label: "Editorial note for Issue 01",
    title: "Why this site opens like a book",
    dek: "A small note about the structure of the thing you are reading.",
    body: [
      "Most portfolios ask you to choose between a grid and a resume. I wanted a sequence instead: an opening, a change of pace, a feature well, and a finish. The book gives the work an order without turning that order into a fence.",
      "The page turn is theater with a practical boundary underneath it. Every resting spread is live HTML; the animation borrows a captured page only while the paper moves. Reduced-motion and smaller-screen readers get the same issue as a vertical stack.",
    ],
  },
  {
    id: "in-defense-of-side-notes",
    status: "Site sample",
    label: "Editorial note for Issue 01",
    title: "In defense of the side note",
    dek: "A small argument for keeping the useful detail close to the fact it complicates.",
    body: [
      "The neatest version of a career is rarely the most accurate one. A title and date can establish the record; a nearby note can show the constraint, surprise, or habit that changed how the work was done.",
      "That is why the resume in this issue keeps its asides attached to individual roles. They are optional context, not missing evidence: the chronology stays readable on its own, while each annotation rewards a closer look.",
    ],
  },
] satisfies readonly Dispatch[];
