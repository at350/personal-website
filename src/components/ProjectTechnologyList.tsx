import { technologyLogo } from "@/lib/technology-icons";

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
            {logo && (
              <span className="proj-tech__mark" data-technology={item} aria-hidden>
                <img src={logo} alt="" width={24} height={24} decoding="async" />
              </span>
            )}
            <span>{item}</span>
          </li>
        );
      })}
    </ul>
  );
}
