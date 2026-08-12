import autodeskLogo from "simple-icons/icons/autodesk.svg";
import expressLogo from "simple-icons/icons/express.svg";
import fastApiLogo from "simple-icons/icons/fastapi.svg";
import geminiLogo from "simple-icons/icons/googlegemini.svg";
import mapboxLogo from "simple-icons/icons/mapbox.svg";
import nextLogo from "simple-icons/icons/nextdotjs.svg";
import pythonLogo from "simple-icons/icons/python.svg";
import reactLogo from "simple-icons/icons/react.svg";
import threeLogo from "simple-icons/icons/threedotjs.svg";
import typeScriptLogo from "simple-icons/icons/typescript.svg";

/**
 * Brand marks live in one catalog so project entries stay lightweight. New
 * stack labels work immediately with a typographic fallback; add a catalog
 * entry only when an official mark is useful.
 */
const TECHNOLOGY_LOGOS: Readonly<Record<string, string>> = {
  "Fusion 360": autodeskLogo,
  Express: expressLogo,
  FastAPI: fastApiLogo,
  Gemini: geminiLogo,
  Mapbox: mapboxLogo,
  "Next.js": nextLogo,
  Python: pythonLogo,
  React: reactLogo,
  "Three.js": threeLogo,
  TypeScript: typeScriptLogo,
};

export function technologyLogo(label: string): string | null {
  return TECHNOLOGY_LOGOS[label] ?? null;
}

export function technologyMonogram(label: string): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "+";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}
