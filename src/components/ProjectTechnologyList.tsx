import { technologyLogo, technologyMonogram } from "@/lib/technology-icons";

interface ProjectTechnologyListProps {
  items: readonly string[];
  label: string;
  className?: string;
}

/** A compact, monochrome stack list shared by the archive and feature well. */
export function ProjectTechnologyList({
  items,
  label,
  className = "",
}: ProjectTechnologyListProps) {
  return (
    <ul className={`proj-tech ${className}`.trim()} aria-label={label}>
      {items.map((item) => {
        const logo = technologyLogo(item);
        return (
          <li key={item} className="proj-tech__item mono-label">
            <span className="proj-tech__mark" aria-hidden>
              {logo ? (
                <img src={logo} alt="" decoding="async" />
              ) : (
                <span>{technologyMonogram(item)}</span>
              )}
            </span>
            <span>{item}</span>
          </li>
        );
      })}
    </ul>
  );
}
