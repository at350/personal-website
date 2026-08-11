import { useNavigate } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about, resume, siteMeta } from "@/lib/content";
import "@/styles/spreads/contents.css";

const FEATURES = [
  {
    page: "04",
    route: "/about",
    title: "the editor's letter",
    dek: about.heading,
  },
  {
    page: "06",
    route: "/profile",
    title: "the profile",
    dek: about.pullQuote,
  },
  {
    page: "08",
    route: "/projects",
    title: "five working prototypes",
    // Verbatim from resume.recognition ("Five-time hackathon winner").
    dek: "Built across energy, supply chains, public health, accessibility, and other very short weekends.",
  },
  {
    page: "12",
    route: "/resume",
    title: "the annotated resume",
    dek: resume.heading,
  },
] as const;

const DEPARTMENTS = [
  { page: "14", route: "/library", title: "the library" },
  { page: "16", route: "/writing", title: "dispatches" },
  { page: "18", route: "/contact", title: "letters + colophon" },
] as const;

const MASTHEAD_ROLES = [
  "Editor-in-Chief",
  "Art Director",
  "Staff Writer",
  "Fact Checker",
  "Systems",
  "Mailroom",
] as const;

function TableOfContents() {
  const navigate = useNavigate();

  return (
    <div className="contents" data-face="verso">
      <p className="contents__eyebrow mono-label">in this issue</p>

      <nav className="contents__features" aria-label="Features">
        <ul>
          {FEATURES.map((feature) => (
            <li key={feature.page}>
              <button
                type="button"
                className="contents__feature"
                data-target-route={feature.route}
                onClick={() => navigate(feature.route)}
              >
                <span className="contents__feature-page">{feature.page}</span>
                <span className="contents__feature-body">
                  <span className="contents__feature-title">{feature.title}</span>
                  <span className="contents__feature-dek">{feature.dek}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <nav className="contents__departments" aria-label="Departments">
        <p className="contents__dept-head mono-label">departments</p>
        <ul className="contents__dept-list">
          {DEPARTMENTS.map((dept) => (
            <li key={dept.page}>
              <button
                type="button"
                className="contents__dept"
                data-target-route={dept.route}
                onClick={() => navigate(dept.route)}
              >
                <span className="contents__dept-page">{dept.page}</span>
                <span className="contents__dept-title">{dept.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Masthead() {
  return (
    <div className="contents" data-face="recto">
      <p className="contents__eyebrow mono-label">FIELD NOTES — ISSUE NO. 01</p>

      <dl className="contents__masthead">
        {MASTHEAD_ROLES.map((role) => (
          <div className="contents__masthead-row" key={role}>
            <dt className="contents__masthead-role">{role}</dt>
            <dd className="contents__masthead-name">{siteMeta.name}</dd>
          </div>
        ))}
      </dl>

      <p className="contents__imprint">
        Published occasionally from {siteMeta.location}.
      </p>

      <p className="contents__intro">{siteMeta.intro}</p>
    </div>
  );
}

export function Contents({ face }: SpreadFaceProps) {
  return face === "verso" ? <TableOfContents /> : <Masthead />;
}
