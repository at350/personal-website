interface DropCapTextProps {
  text: string;
}

/**
 * Renders the initial as a real node so live pages and rasterized page
 * textures share the same typography. The span remains part of the normal
 * text stream for selection and assistive technology.
 */
export function DropCapText({ text }: DropCapTextProps) {
  if (text.length === 0) return null;

  return (
    <>
      <span className="drop-cap__letter">{text[0]}</span>
      {text.slice(1)}
    </>
  );
}
