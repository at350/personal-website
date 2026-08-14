import { withBasePath } from "@/lib/basePath";
import "@/styles/brand.css";

type EditorialTerminalProps = {
  className?: string;
};

/** The shared red terminal used by every display-scale Alan Tai lockup. */
export function EditorialTerminal({ className }: EditorialTerminalProps) {
  const classes = ["editorial-terminal", className].filter(Boolean).join(" ");

  return (
    <span
      aria-hidden="true"
      className={classes}
      data-editorial-terminal=""
      style={{
        backgroundImage: `url("${withBasePath("/brand/editorial-terminal.png")}")`,
      }}
    />
  );
}
