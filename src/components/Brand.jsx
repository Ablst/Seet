export default function Brand({ light = false }) {
  return (
    <span className={`seet-brand ${light ? "seet-brand-light" : ""}`}>
      <svg viewBox="0 0 34 36" width="30" height="32" aria-hidden="true">
        <path
          d="M3 22v10M15 12v17M27 3v23"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
      <strong>见数</strong>
      <span translate="no">Seet</span>
    </span>
  );
}
