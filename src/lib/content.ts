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
  heading: "I like systems with people still visible inside them.",
  lede:
    "Hi, I'm Alan. I learned to make things in a student newsroom, long before I thought of software as the medium.",
  paragraphs: [
    "Reporting taught me to ask one more question before writing. Debate taught me to find the weakest assumption before someone else did. Those habits still shape how I approach software, research, and early-stage teams.",
    "At Northwestern, I study Industrial Engineering and Artificial Intelligence. I build software and AI automations at WingRep, develop evaluation workflows at Meritus Labs, and research computational pathology through FORGE at Northwestern Medicine.",
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
    id: "greenchain",
    name: "GreenChain",
    discipline: "Supply chains",
    year: "2026",
    image: {
      src: "/images/projects/editorial/greenchain-study.webp",
      alt: "Conceptual GreenChain study with black paper nodes, taut threads, white platforms, and one red route through the network.",
    },
    summary:
      "A supply-chain sustainability prototype that researches suppliers, estimates emissions, and maps their relationships.",
    detail:
      "I built supplier-research workflows using a multi-agent system. Our team combined that research with an XGBoost emissions model and a Three.js globe to compare suppliers.",
    stack: ["TypeScript", "Python", "Multi-agent systems", "XGBoost", "Three.js"],
    recognition: "Won three sponsor tracks at HackPrinceton.",
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
      alt: "Conceptual Architec study with layered architectural planes, a black building volume, and a red translucent energy plane.",
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
      alt: "Conceptual TerraBlade study with a pale clay slab, black guide rails, and a broad red pulling grip.",
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
      alt: "Conceptual Vox Vera study with black paper channels and white tokens converging on a red crop frame.",
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
      details: ["Undergraduate studies", "GPA 3.98 / 4.00"],
    },
  ],
  entries: [
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
      id: "wingrep",
      kind: "current",
      organization: "WingRep",
      role: "GTM Engineering Intern",
      dates: "May 2026 to Present",
      summary:
        "Building AI automations and Salesforce integrations for a revenue-intelligence startup.",
      highlights: [
        "Shipped customer-facing Salesforce workflows and automated account research.",
      ],
      marginalia: {
        label: "From the call sheet",
        ariaLabel: "Read a personal note about WingRep",
        text: "weekly demos turn sales feedback into the next sprint's work.",
      },
    },
    {
      id: "meritus-labs",
      kind: "current",
      organization: "Meritus Labs",
      role: "Co-Founder",
      dates: "Apr 2026 to Present",
      summary:
        "Developing AI evaluation workflows with pilot teams, informed by customer discovery.",
      highlights: [
        "Built integrations that connect evaluation workflows to client tools.",
      ],
      marginalia: {
        label: "Margin status",
        ariaLabel: "Read a personal note about Meritus Labs",
        text: "discovery led to pilots; the work now includes evaluation and integration.",
      },
    },
    {
      id: "forge",
      kind: "research",
      organization: "Northwestern Medicine / NNCI",
      role: "Data Science Researcher, FORGE Research Cohort",
      dates: "Jun 2026 to Present",
      summary:
        "Developing models to predict colorectal-cancer molecular markers from tissue images.",
      highlights: [
        "Reviews model attention heat maps with pathologists.",
      ],
      marginalia: {
        label: "At slide scale",
        ariaLabel: "Read a personal note about the FORGE Research Cohort",
        text: "the model combines thousands of image tiles into a slide-level prediction.",
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
      kind: "experience",
      organization: "Lambda Strategy",
      role: "Consultant, Vox Vera client project",
      dates: "Jan 2026 to Mar 2026",
      summary:
        "Analyzed LinkedIn and SEO data to recommend acquisition channels for Vox Vera.",
      highlights: [
        "Developed recommendations for legal, corporate, and academic audiences.",
      ],
      marginalia: {
        label: "What survived",
        ariaLabel: "Read a personal note about the Vox Vera client project",
        text: "the client strategy drew on more than 1,000 marketing data points.",
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
        "Required factual claims to trace to named primary sources.",
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
      id: "uc-merced",
      kind: "research",
      organization: "University of California, Merced",
      role: "Undergraduate Researcher, Computer Vision",
      dates: "May 2023 to Apr 2024",
      summary:
        "Researched crop nutrient detection from drone imagery with Ross Greer.",
      highlights: [
        "Published computer-vision research at CONF-CDS 2024.",
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
        "Investigated backpropagation in spiking neural networks.",
      ],
      marginalia: {
        label: "A different clock",
        ariaLabel: "Read a personal note about the University of California Santa Barbara research",
        text: "the research explored learning in networks that communicate through spikes.",
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
      issuer: "National Speech & Debate Association",
      year: "2025",
      note: "",
    },
    {
      title: "Six-time hackathon winner",
      issuer: "Collegiate hackathons",
      year: "2026",
      note: "HackMIT 2026: 1st Place Grand Prize with Peel.",
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
