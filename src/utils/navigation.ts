export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export type StandaloneRoute = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email" | null;
export type PublicInfoRoute = "about" | "privacy" | "terms" | "accessibility" | "support" | "how-it-works" | null;

export function getStandaloneRoute(): StandaloneRoute {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const hash = window.location.hash;
  if (path === "/login" || hash === "#login") return "login";
  if (path === "/signup" || hash === "#signup") return "signup";
  if (path === "/forgot-password" || hash === "#forgot-password") return "forgot-password";
  if (path === "/reset-password" || hash === "#reset-password") return "reset-password";
  if (path === "/verify-email" || hash === "#verify-email") return "verify-email";
  return null;
}

export function getPublicInfoRoute(): PublicInfoRoute {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/about") return "about";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  if (path === "/accessibility") return "accessibility";
  if (path === "/support") return "support";
  if (path === "/how-it-works") return "how-it-works";
  return null;
}
