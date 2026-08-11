import type { Metadata } from "next";
import { MediaLibrary } from "@/components/MediaLibrary";
import { getMediaLibrary } from "@/lib/media/feeds";

export const metadata: Metadata = {
  title: "Media Library",
  description: "Saved articles, videos, posts, films, and field photos from Alan Tai.",
};

export default async function LibraryPage() {
  const library = await getMediaLibrary();

  return (
    <main id="main-content" className="page-shell library-page">
      <header className="page-hero library-hero">
        <div>
          <p className="page-hero__index">18 / Media cabinet</p>
          <h1 className="page-hero__title">Library</h1>
        </div>
        <div>
          <p className="page-hero__lede">
            Things worth filing: hard systems, good products, strange markets,
            sharp writing, and whatever I watched last.
          </p>
          <p className="library-hero__note">
            Source excerpts and my own notes remain visibly separate.
          </p>
        </div>
      </header>
      <MediaLibrary library={library} />
    </main>
  );
}
