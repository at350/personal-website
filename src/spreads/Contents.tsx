import { useState } from "react";
import type { FocusEvent } from "react";
import { useNavigate } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { siteMeta } from "@/lib/content";
import { withBasePath } from "@/lib/basePath";
import "@/styles/spreads/contents.css";

interface Feature {
  no: string;
  route: string;
  title: string;
  dek: string;
  /** Preview plate for the right band; null falls back to the red ✳ mark. */
  image: string | null;
}

const FEATURES: readonly Feature[] = [
  {
    no: "04",
    route: "/about",
    title: "a letter",
    dek: "systems with people still visible",
    image: "/images/editorial/index-letter.webp",
  },
  {
    no: "06",
    route: "/profile",
    title: "the profile",
    dek: "work habits and off-hours notes",
    image: "/images/editorial/index-profile.webp",
  },
  {
    no: "08",
    route: "/projects",
    title: "five prototypes",
    dek: "energy, supply chains, health",
    image: "/images/editorial/index-projects.webp",
  },
  {
    no: "12",
    route: "/resume",
    title: "the annotated resume",
    dek: "the work, plus what did not fit",
    image: "/images/editorial/index-resume.webp",
  },
];

const DEPARTMENTS = [
  { no: "06", route: "/profile", title: "news" },
  { no: "08", route: "/projects", title: "features" },
  { no: "12", route: "/resume", title: "sports" },
  { no: "14", route: "/library", title: "arts & ent" },
  { no: "16", route: "/writing", title: "opinion" },
  { no: "18", route: "/contact", title: "letters" },
] as const;

/* Verso — the table of contents is the artwork: four Tanker folios in a rail,
   an empty band at the fore-edge that prints a preview when a row is held. */
function FeaturesPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<number | null>(null);

  const clearUnlessInside = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
  };

  return (
    <div className="contents2" data-face="verso">
      <nav
        className="contents2__rows"
        aria-label="Features"
        onMouseLeave={() => setActive(null)}
        onBlur={clearUnlessInside}
      >
        {FEATURES.map((feature, index) => (
          <button
            key={feature.no}
            type="button"
            className="contents2__row"
            data-active={active === index || undefined}
            onClick={() => navigate(feature.route)}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <span className="contents2__no" aria-hidden>
              {feature.no}
            </span>
            <span className="contents2__entry">
              <span className="contents2__title">{feature.title}</span>
              <span className="contents2__dek">{feature.dek}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="contents2__band" aria-hidden>
        {FEATURES.map((feature, index) => (
          <div
            key={feature.no}
            className="contents2__plate"
            data-feature={feature.no}
            data-open={active === index || undefined}
          >
            {feature.image ? (
              <img
                src={withBasePath(feature.image)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="contents2__mark" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Recto — the sections as a hung mono ledger, then the imprint. Nothing else. */
function DepartmentsPage() {
  const navigate = useNavigate();

  return (
    <div className="contents2" data-face="recto">
      <nav className="contents2__ledger" aria-label="Sections">
        {DEPARTMENTS.map((dept) => (
          <button
            key={dept.no}
            type="button"
            className="contents2__dept"
            onClick={() => navigate(dept.route)}
          >
            <span className="contents2__dept-no" aria-hidden>
              {dept.no}
            </span>
            <span className="contents2__dept-title">{dept.title}</span>
          </button>
        ))}
      </nav>

      <div className="contents2__imprint">
        <p className="contents2__place">Published from {siteMeta.location}</p>
        <p className="contents2__intro">{siteMeta.intro}</p>
      </div>
    </div>
  );
}

export function Contents({ face }: SpreadFaceProps) {
  return face === "verso" ? <FeaturesPage /> : <DepartmentsPage />;
}
