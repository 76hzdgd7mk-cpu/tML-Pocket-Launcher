export function SteamBrand() {
  return (
    <div className="steam-brand" aria-label="Steam">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="currentColor" />
        <g fill="none" stroke="#172333" strokeWidth="2.4">
          <circle cx="22" cy="10" r="5.2" />
          <circle cx="22" cy="10" r="2.8" />
          <circle cx="11.1" cy="23.1" r="4.3" />
          <path d="m14.6 25.6 9.7-10.8M7.2 21.3l-7-3.1m13 4.1 4.7-8.7M1 22.5l8 4" />
        </g>
      </svg>
      <span>STEAM</span>
    </div>
  );
}
