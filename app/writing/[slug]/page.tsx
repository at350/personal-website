import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dispatches } from "@/lib/content";

export function generateStaticParams() {
  return dispatches.map((dispatch) => ({ slug: dispatch.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dispatch = dispatches.find((item) => item.id === slug);
  if (!dispatch) return { title: "Dispatch not found" };
  return { title: dispatch.title, description: dispatch.dek };
}

export default async function DispatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dispatch = dispatches.find((item) => item.id === slug);
  if (!dispatch) notFound();
  const index = dispatches.findIndex((item) => item.id === slug);

  return (
    <main id="main-content" className="page-shell article-page">
      <article>
        <header className="article-header">
          <div className="article-header__meta">
            <span>Dispatch {String(index + 1).padStart(3, "0")}</span>
            <span>{dispatch.status}</span>
            <span>{dispatch.label}</span>
          </div>
          <h1>{dispatch.title}</h1>
          <p>{dispatch.dek}</p>
        </header>
        <div className="article-body">
          <aside>
            <span>Editor’s note</span>
            These are clearly labeled starter essays for the new site, not
            historical posts from an existing archive.
          </aside>
          <div>
            {dispatch.body.map((paragraph, paragraphIndex) => (
              <p key={paragraph} className={paragraphIndex === 0 ? "article-body__lead" : ""}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        <footer className="article-footer">
          <Link className="text-link" href="/writing">
            <span aria-hidden="true">←</span> All dispatches
          </Link>
          <a className="text-link" href="mailto:alantai@u.northwestern.edu">
            Send a response <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </article>
    </main>
  );
}
