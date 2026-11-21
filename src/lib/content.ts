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
    "Northwestern student building software and applied AI tools, with experience in product development and research.",
  location: "Cupertino, CA / Evanston, IL",
  issue: {
    number: "01",
    title: "Issue No. 01",
    label: "A personal issue",
  },
} satisfies SiteMeta;


export const about = {
  eyebrow: "Notes from the editor",
  heading: "I build software for the people closest to the problem.",
  lede:
    "Hi, I'm Alan. I learned to make things in a student newsroom, long before I thought of software as the medium.",
  paragraphs: [
    "Reporting taught me to ask one more question before writing. Debate taught me to find the weakest assumption before someone else did. Those habits still shape how I approach software, research, and early-stage teams.",
    "At Northwestern, I study Industrial Engineering and Artificial Intelligence. I build an internal clinical chatbot at AbbVie and lead a client team at Lambda Strategy, after building AI automations at WingRep and researching computational pathology through FORGE at Northwestern Medicine.",
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
    id: "peel",
    image: {
      src: "/images/projects/editorial/peel-study.webp",
      alt: "Peel artwork with a white capsule, connected evidence cards, and a translucent red strip.",
    },
    name: "Peel",
    discipline: "AI evidence retrieval",
    year: "2026",
    featureOrder: 1,
    summary:
      "A HackMIT-winning prototype combining a phone-connected pill tester with an AI evidence engine.",
    detail:
      "I built the evidence engine using FastAPI and Elasticsearch to search regulatory and drug records and produce cited reports. Teammates built the hardware, mobile experience, and chemistry analysis.",
    stack: ["Python", "FastAPI", "Elasticsearch", "Firecrawl", "Three.js"],
    recognition:
      "HackMIT 2026: 1st Place Grand Prize and Elastic's Find the Signal sponsor award.",
    links: [
      { kind: "github", label: "Team repository", href: "https://github.com/viktorinkov/HackMIT-2026" },
    ],
  },
  {
    id: "turfiq",
    image: {
      src: "/images/projects/editorial/turfiq-study.webp",
      alt: "TurfIQ artwork with layered topographic terrain, a soil sensor, and a red maintenance route.",
    },
    name: "TurfIQ",
    discipline: "Field operations",
    year: "2026",
    featureOrder: 2,
    summary:
      "A field-operations app used by three Evanston-area golf courses to record soil moisture and plan maintenance.",
    detail:
      "As lead developer, I turned greenkeepers' field workflows into image-based soil-meter capture, shared readings, and weather-based forecasts that help crews plan their rounds.",
    stack: ["React", "TypeScript", "Supabase", "OpenAI Vision", "Mapbox"],
    links: [
      { kind: "prototype", label: "Live app", href: "https://dtc-2.vercel.app/" },
      { kind: "github", label: "Team repository", href: "https://github.com/marcohartono/DTC-2" },
    ],
  },
  {
    id: "lucid",
    name: "Lucid",
    discipline: "Medical screening",
    year: "2026",
    image: {
      src: "/images/projects/editorial/lucid-study.webp",
      alt: "Lucid artwork with a contoured white dome, a black sensor wand, and a translucent red disc.",
    },
    summary:
      "A handheld brain-bleed screener prototype that reads tissue conductivity as it sweeps across a patient's head.",
    detail:
      "I built the software. A lead agent proposes possible bleeds, subagents test each one on a physics model of the head, and a skeptic agent challenges every finding before a person approves it. I also built the live bleed-map dashboard. A teammate led the idea and the science.",
    stack: ["Python", "LangChain", "LangGraph", "Claude", "pyEIT"],
    recognition:
      "HackPrinceton Fall 2026: Best Overall Hack, Best Use of Deep Agents, Best Physical AI Hack, and 2nd in Best Practical AI Innovation.",
    links: [
      { kind: "devpost", label: "Devpost", href: "https://devpost.com/software/lucid-k078qt" },
    ],
  },
  {
    id: "handoff",
    name: "Handoff",
    discipline: "Emergency response",
    year: "2026",
    image: {
      src: "/images/projects/editorial/handoff-study.webp",
      alt: "Handoff artwork with folded white paper, a black relay block, and a translucent red pulse strip.",
    },
    summary:
      "A voice-and-vision assistant for paramedics that keeps one live incident record from the ambulance to the hospital.",
    detail:
      "I built the voice agent and its grounding checks, the hospital dashboard, and the demo controls. I also modeled the 3D-printed mount, enclosure, and finger clip, and planned the Raspberry Pi vitals hardware.",
    stack: ["Python", "Pipecat", "Nemotron", "SpacetimeDB", "Raspberry Pi"],
    recognition: "Honorable mention in the SpacetimeDB track at HackUTD 2026.",
    links: [
      { kind: "github", label: "Team repository", href: "https://github.com/rishi-golla/hackutd26" },
    ],
  },
  {
    id: "freightline",
    name: "FreightLine",
    discipline: "Freight finance",
    year: "2026",
    image: {
      src: "/images/projects/editorial/freightline-study.webp",
      alt: "FreightLine artwork with fanned white ledger sheets, black column marks, and a translucent red strip.",
    },
    summary:
      "An autonomous back office for freight brokers, where nine AI agents settle, audit, and bill loads under deterministic accounting rules.",
    detail:
      "I built the brokerage agents' A2A wiring and live inbox, the SpacetimeDB backend that holds cases and the audit trail, and the Next.js finance console. A teammate built document intake and personal-data scrubbing.",
    stack: ["Python", "Next.js", "SpacetimeDB", "A2A protocol", "Apify"],
    recognition: "Won Apify's First Customer track at Cal Hacks 13.0.",
    links: [
      { kind: "github", label: "Team repository", href: "https://github.com/rishi-golla/calhacks-26" },
      { kind: "devpost", label: "Devpost", href: "https://devpost.com/software/tbd-i18cf9" },
    ],
  },
  {
    id: "traycer",
    name: "Traycer",
    discipline: "Food waste",
    year: "2026",
    image: {
      src: "/images/projects/editorial/traycer-study.webp",
      alt: "Traycer artwork with a white compartment tray, black paper remnants, and a translucent red frame.",
    },
    summary:
      "A food-waste tool that reads returned dining-hall trays with a phone camera and shows leftovers as estimated cost, carbon, and water.",
    detail:
      "I built the vision service and fine-tuned YOLO-World on synthetic tray images, raising food precision from 34% to 96% and recall from 50% to 79% on a synthetic test set. I also built the camera, review, and dashboard site.",
    stack: ["Python", "FastAPI", "YOLO-World", "OpenCV", "SpacetimeDB"],
    recognition: "2nd place in the SpacetimeDB and Notability tracks at MHacks 2026.",
    links: [
      { kind: "prototype", label: "Live site", href: "https://trayitforward.tech" },
      { kind: "github", label: "Team repository", href: "https://github.com/anton-3/traycer" },
    ],
  },
  {
    id: "greenchain",
    name: "GreenChain",
    discipline: "Supply chains",
    year: "2026",
    image: {
      src: "/images/projects/editorial/greenchain-study.webp",
      alt: "GreenChain artwork with black paper nodes, taut threads, white platforms, and one red route through the network.",
    },
    summary:
      "A supply-chain sustainability prototype that researches suppliers, estimates emissions, and maps their relationships.",
    detail:
      "I built supplier-research workflows using a multi-agent system. Our team combined that research with an XGBoost emissions model and a Three.js globe to compare suppliers.",
    stack: ["TypeScript", "Python", "Multi-agent systems", "XGBoost", "Three.js"],
    recognition: "Won three sponsor tracks at HackPrinceton Spring 2026.",
    links: [
      { kind: "github", label: "Team repository", href: "https://github.com/thejustjim/hackprinceton2026" },
      { kind: "devpost", label: "Devpost", href: "https://devpost.com/software/greenchain-1xglhu" },
    ],
  },
  {
    id: "architec",
    name: "Architec",
    discipline: "Energy systems",
    year: "2026",
    image: {
      src: "/images/projects/editorial/architec-study.webp",
      alt: "Architec artwork with layered architectural planes, a black building volume, and a red translucent energy plane.",
    },
    summary:
      "An energy-audit prototype that turns commercial-building utility bills into ranked upgrades, projected savings, and payback estimates.",
    detail:
      "I built a forecast model from utility-bill history to compare retrofit options by estimated payback. Owners can change assumptions and re-rank the options; the savings are projections.",
    stack: ["Next.js", "FastAPI", "Gemini", "Mapbox", "Three.js"],
    recognition: "Placed 3rd of 70 projects and won the appifex AI track at WildHacks.",
    links: [
      { kind: "devpost", label: "Devpost", href: "https://devpost.com/software/audit-kc5eiw" },
    ],
  },
  {
    id: "arrival",
    image: {
      src: "/images/projects/editorial/arrival-study.webp",
      alt: "Arrival artwork with financial documents passing through a translucent red gateway toward a black credit pass.",
    },
    name: "Arrival",
    discipline: "Financial access",
    year: "2026",
    summary:
      "A prototype that turns foreign rent history, bank statements, and domestic cash flow into a portable credit profile for immigrants.",
    detail:
      "I helped build the full-stack application and AI workflows for interpreting financial records. The prototype combines document analysis with a digital pass.",
    stack: ["Next.js", "Hono", "LangGraph", "Supabase", "Prisma"],
    recognition: "Won 1st place at ALI Builds at the University of Chicago.",
    links: [
      { kind: "prototype", label: "Live prototype", href: "https://nori-u.vercel.app/" },
      { kind: "github", label: "Team repository", href: "https://github.com/z1ros/nori" },
    ],
  },
  {
    id: "terrablade",
    name: "TerraBlade",
    discipline: "Accessible product design",
    year: "2025",
    image: {
      src: "/images/projects/editorial/terrablade-study.webp",
      alt: "TerraBlade artwork with a pale clay slab, black guide rails, and a broad red pulling grip.",
    },
    summary:
      "An accessible clay slab-forming device built with Envision Unlimited that halved forming time for artists with physical disabilities.",
    detail:
      "On a four-person course team, I led product direction through interviews, CAD, fabrication, and user testing. We rejected press designs whose force and weight demands made them inaccessible.",
    stack: ["Fusion 360", "User research", "Rapid prototyping", "Fabrication"],
  },
  {
    id: "vox-vera",
    name: "Vox Vera",
    discipline: "Go-to-market strategy",
    year: "2026",
    image: {
      src: "/images/projects/editorial/vox-vera-study.webp",
      alt: "Vox Vera artwork with black paper channels and white tokens converging on a red crop frame.",
    },
    summary:
      "A Lambda Strategy client project recommending acquisition channels and audience segments for Vox Vera.",
    detail:
      "I analyzed LinkedIn and SEO data, then helped shape a client-facing strategy for legal, corporate, and academic audiences.",
    stack: ["Market research", "Segmentation", "SEO", "Go-to-market strategy"],
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
      details: ["GPA 3.98 / 4.00"],
    },
  ],
  entries: [
    {
      id: "abbvie",
      kind: "current",
      organization: "AbbVie",
      role: "Jr. Business Systems Analyst",
      dates: "Sep 2026 to Present",
      summary:
        "Building an internal clinical chatbot as its sole engineer.",
      highlights: [
        "Cleared its data-access rules with IT and Security ahead of rollout to 40 clinicians.",
      ],
      marginalia: {
        label: "From the backlog",
        ariaLabel: "Read a personal note about AbbVie",
        text: "six clinician feedback sessions became the ranked backlog for the next releases.",
      },
    },
    {
      id: "wingrep",
      kind: "experience",
      organization: "WingRep",
      role: "GTM Engineering Intern",
      dates: "May 2026 to Sep 2026",
      summary:
        "Built AI automations and Salesforce integrations for a revenue-intelligence startup.",
      highlights: [
        "Shipped customer-facing Salesforce workflows and automated account research.",
      ],
      marginalia: {
        label: "From the call sheet",
        ariaLabel: "Read a personal note about WingRep",
        text: "weekly demos turned sales feedback into the next sprint's work.",
      },
    },
    {
      id: "ember-studios",
      kind: "experience",
      organization: "Ember Studios",
      role: "Founding Intern",
      dates: "Apr 2026 to Jul 2026",
      summary:
        "Built voice-agent infrastructure for personal memory preservation.",
      highlights: [
        "Worked on backend systems, observability, and voice reliability.",
      ],
      marginalia: {
        label: "A note from the build",
        ariaLabel: "Read a personal note about Ember Studios",
        text: "the work is nda'd. the question of what makes a machine conversation worth keeping is not.",
      },
    },
    {
      id: "forge",
      kind: "research",
      organization: "Northwestern Medicine / NNCI",
      role: "Data Science Researcher, FORGE Research Cohort",
      dates: "Jun 2026 to Sep 2026",
      summary:
        "Developed models to predict colorectal-cancer molecular markers from tissue images.",
      highlights: [
        "Reviewed model attention heat maps with pathologists.",
      ],
      marginalia: {
        label: "At slide scale",
        ariaLabel: "Read a personal note about the FORGE Research Cohort",
        text: "the model combined thousands of image tiles into a slide-level prediction.",
      },
    },
    {
      id: "copilot-ambassador",
      kind: "leadership",
      organization: "Microsoft",
      role: "Copilot Student Ambassador",
      dates: "Fall 2026 to Present",
      summary:
        "Selected as one of two Northwestern ambassadors for Microsoft's Fall 2026 Copilot program.",
      highlights: [],
      marginalia: {
        label: "First proposals",
        ariaLabel: "Read a personal note about the Copilot Student Ambassador program",
        text: "i proposed two campus events: a copilot tabling day and a hands-on demo for coursework.",
      },
    },
    {
      id: "italented",
      kind: "leadership",
      organization: "iTalented",
      role: "Founder and President",
      dates: "Sep 2024 to Present",
      summary:
        "Founded a 50-member computer science community and coached student projects.",
      highlights: [
        "Members went on to win eight ACSL national awards.",
      ],
      marginalia: {
        label: "The good scoreboard",
        ariaLabel: "Read a personal note about iTalented",
        text: "weekly problem sets and project critiques keep the coaching concrete.",
      },
    },
    {
      id: "tamid",
      kind: "experience",
      organization: "TAMID Group",
      role: "Consultant",
      dates: "Apr 2026 to Jun 2026",
      summary:
        "Developed product and go-to-market recommendations for Button AI, an AI paralegal startup.",
      highlights: [
        "Translated competitor research into a pricing and fundraising deck.",
      ],
      marginalia: {
        label: "Deck rule",
        ariaLabel: "Read a personal note about TAMID Group",
        text: "the client used our research to rethink its market narrative.",
      },
    },
    {
      id: "teach-for-chicago-journalism",
      kind: "experience",
      organization: "Teach for Chicago Journalism, Northwestern Medill",
      role: "Administrative Aide",
      dates: "Sep 2025 to Jun 2026",
      summary:
        "Built operations and audience tools for a journalism program serving 1,000+ students.",
      highlights: [
        "Improved Mailchimp segmentation and built a React audience dashboard.",
      ],
      marginalia: {
        label: "Behind the byline",
        ariaLabel: "Read a personal note about Teach for Chicago Journalism",
        text: "the work connected program records, communications, and scheduling.",
      },
    },
    {
      id: "thomson-reuters",
      kind: "experience",
      organization: "Thomson Reuters CS+Law Innovation Lab",
      role: "Research Fellow",
      dates: "Jan 2026 to May 2026",
      summary:
        "Built pipelines to evaluate language models on structured legal tasks.",
      highlights: [
        "Combined embeddings, clustering, and rubric-based evaluation with human review.",
      ],
      marginalia: {
        label: "Evaluation footnote",
        ariaLabel: "Read a personal note about the Thomson Reuters CS+Law Innovation Lab",
        text: "structured outputs and shared rubrics made model comparisons inspectable.",
      },
    },
    {
      id: "lambda-strategy",
      kind: "current",
      organization: "Lambda Strategy",
      role: "Consultant, then Project Lead",
      dates: "Jan 2026 to Present",
      summary:
        "Leading a four-person team for a life-sciences client.",
      highlights: [
        "Earlier, recommended acquisition channels to Vox Vera for legal, corporate, and academic audiences.",
      ],
      marginalia: {
        label: "What survived",
        ariaLabel: "Read a personal note about Lambda Strategy",
        text: "the vox vera strategy drew on more than 1,000 marketing data points.",
      },
    },
    {
      id: "el-estoque",
      kind: "leadership",
      organization: "El Estoque Newsmagazine",
      role: "Editor-in-Chief",
      dates: "May 2024 to Jun 2025",
      summary:
        "Led reporting, editing, and production for a 65-member student newsroom.",
      highlights: [
        "Instituted a rule that every factual claim trace to a named primary source.",
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
        "Led team operations and coached Public Forum debate while competing.",
      highlights: [
        "Won the 2025 NSDA Public Forum national title.",
      ],
      marginalia: {
        label: "Crossfire lesson",
        ariaLabel: "Read a personal note about Monta Vista Debate",
        text: "good prep had to be rigorous enough to win and clear enough to teach.",
      },
    },
    {
      id: "uc-santa-barbara",
      kind: "research",
      organization: "University of California, Santa Barbara",
      role: "Student Researcher, Spiking Neural Networks",
      dates: "Jul 2024 to Aug 2024",
      summary:
        "Studied neuromorphic learning systems.",
      highlights: [
        "Investigated backpropagation through spiking networks.",
      ],
      marginalia: {
        label: "A different clock",
        ariaLabel: "Read a personal note about the University of California Santa Barbara research",
        text: "the research explored learning in networks that communicate through spikes.",
      },
    },
    {
      id: "uc-merced",
      kind: "research",
      organization: "University of California, Merced",
      role: "Student Researcher, Computer Vision",
      dates: "May 2023 to Apr 2024",
      summary:
        "Researched crop nutrient detection from drone imagery.",
      highlights: [
        "Published the work as a sole-author paper at CONF-CDS 2024.",
      ],
      marginalia: {
        label: "First paper",
        ariaLabel: "Read a personal note about the University of California Merced research",
        text: "my first paper started with drone photos of winter crops.",
      },
    },
  ],
  recognition: [
    {
      title: "National Journalist of the Year",
      issuer: "Journalism Education Association",
      year: "2025",
      note: "",
    },
    {
      title: "Public Forum National Champion",
      issuer: "NSDA",
      year: "2025",
      note: "",
    },
    {
      title: "Nine-time hackathon winner",
      issuer: "Hackathons",
      year: "2022–2026",
      note: "HackMIT Grand Prize (Peel); HackPrinceton Best Overall (Lucid).",
    },
  ],
} satisfies ResumeContent;

export const contact = {
  eyebrow: "Colophon",
  heading: "Get in touch about internships, research, or a project.",
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
      kind: "goodreads",
      label: "Goodreads",
      display: "alan-tai",
      href: "https://www.goodreads.com/user/show/169946288-alan-tai",
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
    status: "Site notes",
    label: "Site notes / Issue 01",
    title: "Why this site opens like a book",
    dek: "A small note about the structure of the thing you are reading.",
    body: [
      "Most portfolios ask you to choose between a grid and a resume. I wanted a sequence instead: an opening, a change of pace, a feature well, and a finish. The book gives the work an order without turning that order into a fence.",
      "The page turn is theater with a practical boundary underneath it. Every resting spread is live HTML; the animation borrows a captured page only while the paper moves. Small screens and touch devices default to a single-page view. Reduced-motion readers default to a vertical stack, also available as the reader view. Saved view preferences can change these defaults.",
    ],
  },
  {
    id: "in-defense-of-side-notes",
    status: "Site notes",
    label: "Site notes / Issue 01",
    title: "In defense of the side note",
    dek: "A small argument for keeping the useful detail close to the fact it complicates.",
    body: [
      "The neatest version of a career is rarely the most accurate one. A title and date can establish the record; a nearby note can show the constraint, surprise, or habit that changed how the work was done.",
      "That is why the resume in this issue keeps its asides attached to individual roles. They are optional context, not missing evidence: the chronology stays readable on its own, while each annotation rewards a closer look.",
    ],
  },
] satisfies readonly Dispatch[];
