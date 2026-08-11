import type { Metadata } from "next";
import { contact } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Alan Tai by email or find him elsewhere online.",
};

export default function ContactPage() {
  return (
    <main id="main-content" className="page-shell contact-page">
      <header className="contact-hero">
        <p className="page-hero__index">26 / {contact.eyebrow}</p>
        <h1>{contact.heading}</h1>
        <p>{contact.note}</p>
      </header>
      <section className="contact-links" aria-label="Contact links">
        {contact.links.map((item, index) => (
          <a
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noreferrer" : undefined}
            key={item.kind}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <p>{item.label}</p>
              <h2>{item.display}</h2>
            </div>
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </section>
      <p className="contact-signoff">Connect with me, please.</p>
    </main>
  );
}
