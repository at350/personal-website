import elasticsearchLogo from "simple-icons/icons/elasticsearch.svg";
import supabaseLogo from "simple-icons/icons/supabase.svg";
import honoLogo from "simple-icons/icons/hono.svg";
import langGraphLogo from "simple-icons/icons/langgraph.svg";
import prismaLogo from "simple-icons/icons/prisma.svg";
import openAiLogo from "@/assets/technology/openai.svg";
import firecrawlLogo from "@/assets/technology/firecrawl.svg";
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

/** Local brand assets work offline and during page texture capture.
 * Methods and labels without a suitable mark render as text, without fake initials.
 */
const TECHNOLOGY_LOGOS: Readonly<Record<string, string>> = {
  "Fusion 360": autodeskLogo,
  Elasticsearch: elasticsearchLogo,
  Supabase: supabaseLogo,
  Hono: honoLogo,
  LangGraph: langGraphLogo,
  Prisma: prismaLogo,
  "OpenAI Vision": openAiLogo,
  Firecrawl: firecrawlLogo,
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
