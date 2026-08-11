"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["About", "/about"],
  ["Projects", "/projects"],
  ["Resume", "/resume"],
  ["Library", "/library"],
  ["Writing", "/writing"],
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="site-mark"
          href="/"
          aria-label="Alan Tai, home"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <span className="site-mark__monogram" aria-hidden="true">
            AT
          </span>
          <span className="site-mark__wordmark">Alan Tai</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <ul>
            {items.map(([label, href], index) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`)
                      ? "page"
                      : undefined
                  }
                >
                  <span aria-hidden="true">0{index + 1}</span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          className="header-contact"
          href="/contact"
          aria-current={pathname === "/contact" ? "page" : undefined}
        >
          Say hello
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
