import type { Metadata } from "next";
import "@fontsource/shippori-mincho/latin-400.css";
import "@fontsource/shippori-mincho/latin-600.css";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: {
    default: "Alan Tai | Field Notes",
    template: "%s | Alan Tai",
  },
  description:
    "Alan Tai builds useful things, studies difficult systems, and keeps field notes along the way.",
  keywords: [
    "Alan Tai",
    "product",
    "artificial intelligence",
    "journalism",
    "portfolio",
  ],
  authors: [{ name: "Alan Tai" }],
  creator: "Alan Tai",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Alan Tai | Field Notes",
    description:
      "Projects, dispatches, marginalia, and a life still under construction.",
    siteName: "Alan Tai | Field Notes",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "An open Field Notes magazine with an Alan Tai cover",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alan Tai | Field Notes",
    description:
      "Projects, dispatches, marginalia, and a life still under construction.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Alan Tai",
    description:
      "Northwestern student building software, research, and early-stage products.",
    email: "mailto:alantai@u.northwestern.edu",
    sameAs: [
      "https://www.linkedin.com/in/alan-tai-nu/",
      "https://github.com/at350",
      "https://x.com/alan_tai1",
      "https://devpost.com/alantai19",
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body id="top">
        <a className="skip-link" href="#main-content">
          Skip to the story
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
      </body>
    </html>
  );
}
