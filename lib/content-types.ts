export type SectionId =
  | "cover"
  | "about"
  | "projects"
  | "resume"
  | "library"
  | "dispatches"
  | "contact";

export interface NavigationItem {
  label: string;
  href: `#${SectionId}`;
  folio: string;
}

export interface SiteMeta {
  name: string;
  title: string;
  description: string;
  intro: string;
  location: string;
  issue: {
    number: string;
    title: string;
    label: string;
  };
}

export interface AboutPhoto {
  src: `/images/${string}`;
  alt: string;
  caption: string;
  shape: "portrait" | "landscape" | "square";
}

export interface AboutContent {
  eyebrow: string;
  heading: string;
  lede: string;
  paragraphs: readonly string[];
  pullQuote: string;
  notes: readonly {
    label: string;
    text: string;
  }[];
  photos: readonly AboutPhoto[];
}

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  id: string;
  name: string;
  discipline: string;
  year: string;
  summary: string;
  detail: string;
  stack: readonly string[];
  recognition?: string;
  link?: ProjectLink;
}

/**
 * Marginalia is supporting content, never the only place a resume fact appears.
 * Render the trigger as a button so the note works with touch and keyboard input.
 */
export interface ResumeMarginalia {
  label: string;
  ariaLabel: string;
  text: string;
}

export type ResumeEntryKind =
  | "current"
  | "experience"
  | "research"
  | "leadership";

export interface ResumeEntry {
  id: string;
  kind: ResumeEntryKind;
  organization: string;
  role: string;
  dates: string;
  summary: string;
  highlights: readonly string[];
  marginalia: ResumeMarginalia;
}

export interface EducationEntry {
  institution: string;
  program: string;
  location: string;
  details: readonly string[];
}

export interface Recognition {
  title: string;
  issuer: string;
  year: string;
  note: string;
}

export interface ResumeContent {
  eyebrow: string;
  heading: string;
  introduction: string;
  education: readonly EducationEntry[];
  entries: readonly ResumeEntry[];
  recognition: readonly Recognition[];
}

export type ContactKind =
  | "email"
  | "linkedin"
  | "github"
  | "x"
  | "devpost"
  | "journalism";

export interface ContactLink {
  kind: ContactKind;
  label: string;
  display: string;
  href: string;
  external: boolean;
}

export interface ContactContent {
  eyebrow: string;
  heading: string;
  note: string;
  links: readonly ContactLink[];
}

export interface Dispatch {
  id: string;
  status: "Site sample";
  label: string;
  title: string;
  dek: string;
  body: readonly string[];
}
