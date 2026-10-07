/** Verdict mark: balanced scales. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Verdict">
      <rect width="32" height="32" rx="8" fill="#38BDF8" />
      <g fill="none" stroke="#0D1117" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 7v18M10 25h12M8 11h16" />
        <path d="M8 11l-3.5 7h7L8 11zM24 11l-3.5 7h7L24 11z" />
      </g>
      <circle cx="16" cy="7" r="1.8" fill="#0D1117" />
    </svg>
  );
}
