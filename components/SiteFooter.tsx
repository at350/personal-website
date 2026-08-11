import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__headline">
        <span>There is always</span>
        <Link href="mailto:alantai@u.northwestern.edu">room in the margins.</Link>
      </div>
      <div className="site-footer__rail">
        <span>Alan Tai</span>
        <span>Evanston / Chicago / wherever the work goes</span>
        <span>Edition 01 / 2026</span>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
