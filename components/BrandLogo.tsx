/** Propojené body jako drobná připomínka každodenních záznamů a jejich souvislostí. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="16" fill="#40553d" />
      <path
        d="M12 31V21C12 15.5 15.5 12 21 12H22C27.5 12 31 15.5 31 20.5C31 25.5 27.5 28 22.5 28H20L34 36"
        stroke="#f8f8f2"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="32" r="3.1" fill="#d9b291" />
      <circle cx="34" cy="36" r="3.1" fill="#d9b291" />
      <circle cx="31" cy="20" r="2.6" fill="#d9b291" />
    </svg>
  );
}

export default function BrandLogo({
  showTagline = false,
  className = '',
}: {
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={`brand-logo ${className}`}>
      <BrandMark className="brand-logo-mark" />
      <span className="brand-logo-copy">
        <span className="brand-logo-name">Rozumím <span>tělu</span></span>
        {showTagline && <span className="brand-logo-caption">OSOBNÍ DENÍK SOUVISLOSTÍ</span>}
      </span>
    </span>
  );
}
