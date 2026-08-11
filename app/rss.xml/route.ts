import { Feed } from "feed";
import { dispatches } from "@/lib/content";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const feed = new Feed({
    title: "Alan Tai | Field Notes",
    description: "Dispatches on products, systems, journalism, and rabbit holes.",
    id: origin,
    link: origin,
    language: "en",
    copyright: `Copyright ${new Date().getUTCFullYear()} Alan Tai`,
    feedLinks: { rss2: `${origin}/rss.xml` },
    author: { name: "Alan Tai", email: "alantai@u.northwestern.edu" },
  });

  for (const [index, dispatch] of dispatches.entries()) {
    feed.addItem({
      title: dispatch.title,
      id: `${origin}/writing/${dispatch.id}`,
      link: `${origin}/writing/${dispatch.id}`,
      description: dispatch.dek,
      content: dispatch.body.map((paragraph) => `<p>${paragraph}</p>`).join(""),
      author: [{ name: "Alan Tai", email: "alantai@u.northwestern.edu" }],
      date: new Date(Date.UTC(2026, 7, 11 - index)),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
