import { z } from "zod";

export const SiteMetaSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  intro: z.string(),
  location: z.string(),
  issue: z.object({
    number: z.string(),
    title: z.string(),
    label: z.string(),
  }),
});
export type SiteMeta = z.infer<typeof SiteMetaSchema>;

export const PhotoSchema = z.object({
  src: z.string().startsWith("/images/"),
  alt: z.string().min(8),
  caption: z.string(),
  shape: z.enum(["square", "portrait", "landscape"]),
});
export type Photo = z.infer<typeof PhotoSchema>;

export const AboutSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  lede: z.string(),
  paragraphs: z.array(z.string()).min(1),
  pullQuote: z.string(),
  notes: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .min(3),
  photos: z.array(PhotoSchema).min(1),
});
export type AboutContent = z.infer<typeof AboutSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  discipline: z.string(),
  year: z.string(),
  summary: z.string(),
  detail: z.string(),
  stack: z.array(z.string()).min(2),
  recognition: z.string().optional(),
  image: z.string().optional(),
  link: z.object({ label: z.string(), href: z.string().url() }).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MarginaliaSchema = z.object({
  label: z.string(),
  ariaLabel: z.string(),
  text: z.string().min(10),
});
export type MarginaliaNote = z.infer<typeof MarginaliaSchema>;

export const ResumeEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["current", "research", "leadership", "experience"]),
  organization: z.string(),
  role: z.string(),
  dates: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  marginalia: MarginaliaSchema,
});
export type ResumeEntry = z.infer<typeof ResumeEntrySchema>;

export const ResumeSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  introduction: z.string(),
  education: z.array(
    z.object({
      institution: z.string(),
      program: z.string(),
      location: z.string(),
      details: z.array(z.string()),
    }),
  ),
  entries: z.array(ResumeEntrySchema).min(8),
  recognition: z.array(
    z.object({
      title: z.string(),
      issuer: z.string(),
      year: z.string(),
      note: z.string(),
    }),
  ),
});
export type ResumeContent = z.infer<typeof ResumeSchema>;

export const ContactLinkSchema = z.object({
  kind: z.string(),
  label: z.string(),
  display: z.string(),
  href: z.string(),
  external: z.boolean(),
});
export const ContactSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  note: z.string(),
  links: z.array(ContactLinkSchema).min(4),
});
export type ContactContent = z.infer<typeof ContactSchema>;

export const DispatchSchema = z.object({
  id: z.string(),
  status: z.string(),
  label: z.string(),
  title: z.string(),
  dek: z.string(),
  body: z.array(z.string()).min(1),
});
export type Dispatch = z.infer<typeof DispatchSchema>;
