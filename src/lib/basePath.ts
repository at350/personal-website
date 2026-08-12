const DEFAULT_BASE = import.meta.env.BASE_URL;

function normalizeBase(base: string): string {
  const trimmed = base.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

/** Prefix a public-directory asset with Vite's deployment base path. */
export function withBasePath(path: string, base = DEFAULT_BASE): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const normalizedBase = normalizeBase(base);
  if (normalizedBase === "/") return path;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

/** React Router expects the same base without Vite's trailing slash. */
export function routerBasename(base = DEFAULT_BASE): string {
  const normalizedBase = normalizeBase(base);
  return normalizedBase === "/" ? "/" : normalizedBase.slice(0, -1);
}
