import type { ReactNode } from "react";

export function ThemeIcon({ dark }: { dark: boolean }): ReactNode {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 14.1A8.2 8.2 0 0 1 9.9 3.8a8.5 8.5 0 1 0 10.3 10.3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" />
    </svg>
  );
}

export function PersonIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7" r="3.4" />
      <path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6" />
    </svg>
  );
}

export function SearchIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export function HomeIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 9.7V19a1 1 0 0 0 1 1h3v-5.4h4V20h3a1 1 0 0 0 1-1V9.7" />
    </svg>
  );
}

export function AssistantIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.6 13.5 8l4.3 1.5-4.3 1.5L12 15.4l-1.5-4.4-4.3-1.5L10.5 8 12 3.6Z" />
      <path d="m18.6 14.6.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" />
    </svg>
  );
}

export function RecipesIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 6.6c-1.7-1.3-3.9-1.8-6.3-1.6v12.6c2.4-.2 4.6.3 6.3 1.6 1.7-1.3 3.9-1.8 6.3-1.6V5c-2.4-.2-4.6.3-6.3 1.6Z" />
      <path d="M12 6.6v12.6" />
    </svg>
  );
}

export function FlipCameraIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5h3.2L8.6 5.6h6.8l1.4 1.9H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12.2a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
      <path d="m17 4 1.6 1.6L17 7.2" />
    </svg>
  );
}

export function CameraOffIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5h3.2L8.6 5.6h6.8l1.4 1.9H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" />
      <path d="M9.4 12.2a3 3 0 0 0 4.35 2.68" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
