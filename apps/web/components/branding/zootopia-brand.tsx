import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";

type ZootopiaMarkProps = {
  className?: string;
  title?: string;
};

type ZootopiaLockupProps = {
  className?: string;
  compact?: boolean;
  showTagline?: boolean;
};

export function ZootopiaMark({
  className,
  title = APP_NAME,
}: ZootopiaMarkProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="zootopia-brand-gradient" x1="12" y1="8" x2="84" y2="88">
          <stop offset="0%" stopColor="#0f8f7e" />
          <stop offset="100%" stopColor="#0c6f62" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="url(#zootopia-brand-gradient)" />
      <circle
        cx="30"
        cy="28"
        r="9"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="3"
      />
      <circle
        cx="66"
        cy="28"
        r="9"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="3"
      />
      <path
        d="M42 27h12M45 27v12L30 63c-2.3 3.6.3 8 4.5 8h27c4.2 0 6.8-4.4 4.5-8L51 39V27"
        fill="rgba(255,255,255,0.12)"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
      <path
        d="M43 50c5 3 10 4 15 4s10-1 15-4"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <path
        d="M24 55c10-15 34-21 49-10"
        fill="none"
        stroke="rgba(255,255,255,0.34)"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle cx="69" cy="43" r="3.5" fill="#f2c66a" />
    </svg>
  );
}

export function ZootopiaLockup({
  className,
  compact = false,
  showTagline = true,
}: ZootopiaLockupProps) {
  return (
    <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}${className ? ` ${className}` : ""}`}>
      <ZootopiaMark className={`brand-mark${compact ? " brand-mark--compact" : ""}`} />
      <div className="brand-copy">
        <span className="brand-wordmark">{APP_NAME}</span>
        {showTagline ? <span className="brand-tagline">{APP_TAGLINE}</span> : null}
      </div>
    </div>
  );
}
