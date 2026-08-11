import "@/styles/furniture.css";

/** Printer's-proof overlay: baseline grid, 12 columns, crop marks, CMYK bar. */
export function GridOverlay() {
  return (
    <div className="grid-overlay" aria-hidden>
      <div className="grid-overlay__columns" />
      <div className="grid-overlay__baselines" />
      <svg className="grid-overlay__crop grid-overlay__crop--tl" viewBox="0 0 20 20">
        <path d="M0 14h6M14 0v6" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
      <svg className="grid-overlay__crop grid-overlay__crop--br" viewBox="0 0 20 20">
        <path d="M20 6h-6M6 20v-6" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
      <svg className="grid-overlay__reg" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M10 1v18M1 10h18" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <div className="grid-overlay__cmyk">
        <i style={{ background: "#00b7eb" }} />
        <i style={{ background: "#ec008c" }} />
        <i style={{ background: "#ffef00" }} />
        <i style={{ background: "#1c1a17" }} />
      </div>
    </div>
  );
}
