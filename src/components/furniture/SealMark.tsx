import "@/styles/furniture.css";

interface SealMarkProps {
  size?: number;
  className?: string;
}

/** Vermilion kaku-in seal — the page's rakkan. One per spread, placed as counterweight. */
export function SealMark({ size = 40, className = "" }: SealMarkProps) {
  return (
    <svg
      className={`seal ${className}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
    >
      <defs>
        <filter id="seal-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" result="n" seed="7" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
      </defs>
      <g filter="url(#seal-rough)">
        <rect x="1.5" y="1.5" width="37" height="37" rx="3.5" fill="var(--shu)" />
        <text
          x="20"
          y="21.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-ui)"
          fontWeight="700"
          fontSize="17"
          letterSpacing="0.5"
          fill="var(--washi-hi)"
        >
          AT
        </text>
      </g>
    </svg>
  );
}
