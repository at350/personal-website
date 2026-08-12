import { SPREADS, spreadForRoute } from "@/magazine/folio";
import { dispatches } from "@/lib/content";

const BASE_TITLE = "Alan Tai";
const BASE_DESCRIPTION =
  "Alan Tai builds software, research, and early-stage products. Issue No. 01.";

const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": { title: BASE_TITLE, description: BASE_DESCRIPTION },
  "/contents": { title: `Contents · ${BASE_TITLE}`, description: "What's in Issue No. 01." },
  "/about": { title: `Letter · ${BASE_TITLE}`, description: "A short letter from Alan." },
  "/profile": { title: `Profile · ${BASE_TITLE}`, description: "Work habits and off-hours notes." },
  "/projects": { title: `Projects · ${BASE_TITLE}`, description: "A growing archive of working prototypes, tools, and product systems." },
  "/resume": { title: `Resume · ${BASE_TITLE}`, description: "The annotated resume." },
  "/library": { title: `Library · ${BASE_TITLE}`, description: "Films, articles, posts." },
  "/writing": { title: `Dispatches · ${BASE_TITLE}`, description: "Occasional writing." },
  "/contact": { title: `Letters · ${BASE_TITLE}`, description: "Send a note." },
  "/colophon": { title: `Colophon · ${BASE_TITLE}`, description: "What Issue No. 01 is set in and built with." },
  "/reader": { title: `Reader · ${BASE_TITLE}`, description: BASE_DESCRIPTION },
};

export function applyMeta(pathname: string) {
  let meta = ROUTE_META[pathname];
  if (!meta && pathname.startsWith("/writing/")) {
    const slug = pathname.split("/")[2];
    const dispatch = dispatches.find((d) => d.id === slug);
    if (dispatch) meta = { title: `${dispatch.title} · ${BASE_TITLE}`, description: dispatch.dek };
  }
  if (!meta) {
    const index = spreadForRoute(pathname);
    meta = ROUTE_META[SPREADS[index]?.route ?? "/"] ?? ROUTE_META["/"]!;
  }
  document.title = meta.title;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", meta.description);
}
