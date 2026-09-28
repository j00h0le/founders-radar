export function RadarMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Startup Radar mark"
    >
      <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="26" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="100" y1="18" x2="100" y2="182" stroke="currentColor" strokeWidth="1.5" />
      <line x1="18" y1="100" x2="182" y2="100" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="5" fill="currentColor" />
    </svg>
  );
}
