import { SPREADS, spreadForRoute } from "@/magazine/folio";
import { dispatches, siteMeta } from "@/lib/content";

const BASE_TITLE = "Alan Tai — Field Notes";

const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": { title: BASE_TITLE, description: siteMeta.description },
  "/contents": { title: `Contents · ${BASE_TITLE}`, description: "What's in Issue No. 01." },
  "/about": { title: `The Editor's Letter · ${BASE_TITLE}`, description: "Who makes this magazine, and why." },
  "/profile": { title: `The Profile · ${BASE_TITLE}`, description: "Hobbies, photographs, and unnecessary pilgrimages." },
  "/projects": { title: `Projects · ${BASE_TITLE}`, description: "Five working prototypes across energy, supply chains, and public health." },
  "/resume": { title: `Resume · ${BASE_TITLE}`, description: "The annotated resume, with notes in the margins." },
  "/library": { title: `The Library · ${BASE_TITLE}`, description: "A self-updating media diet: posts, films, articles." },
  "/writing": { title: `Dispatches · ${BASE_TITLE}`, description: "Occasional writing." },
  "/contact": { title: `Letters · ${BASE_TITLE}`, description: "Send a note, a link, or a strange problem." },
  "/colophon": { title: `Colophon · ${BASE_TITLE}`, description: "What this magazine is set in, printed on, and built with." },
  "/reader": { title: `Reader · ${BASE_TITLE}`, description: siteMeta.description },
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
