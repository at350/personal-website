import type { Metadata } from "next";
import Link from "next/link";
import { dispatches } from "@/lib/content";

export const metadata: Metadata = {
  title: "Writing",
  description: "Dispatches on products, systems, journalism, and rabbit holes.",
};

export default function WritingPage() {
  return (
    <main id="main-content" className="page-shell writing-page">
      <header className="page-hero writing-hero">
        <div>
          <p className="page-hero__index">22 / Dispatches</p>
          <h1 className="page-hero__title">Writing</h1>
        </div>
        <p className="page-hero__lede">
          A home for longer notes. The first pieces explain the architecture of
          this issue while the full archive begins to grow.
        </p>
      </header>

      <section className="writing-index" aria-label="Dispatch index">
        {dispatches.map((dispatch, index) => (
          <article key={dispatch.id}>
            <div className="writing-index__meta">
              <span>{String(index + 1).padStart(3, "0")}</span>
              <span>{dispatch.status}</span>
              <span>{dispatch.label}</span>
            </div>
            <h2>
              <Link href={`/writing/${dispatch.id}`}>{dispatch.title}</Link>
            </h2>
            <p>{dispatch.dek}</p>
            <Link className="text-link" href={`/writing/${dispatch.id}`}>
              Read dispatch <span aria-hidden="true">↗</span>
            </Link>
          </article>
        ))}
      </section>

      <aside className="writing-rss">
        <span aria-hidden="true">RSS</span>
        <div>
          <h2>One feed, wherever the writing goes.</h2>
          <p>
            The site publishes a standard RSS feed at <code>/rss.xml</code>. A
            Substack feed can also be ingested into the media library when it is ready.
          </p>
          <a className="text-link" href="/rss.xml">
            Open RSS feed <span aria-hidden="true">↗</span>
          </a>
        </div>
      </aside>
    </main>
  );
}
