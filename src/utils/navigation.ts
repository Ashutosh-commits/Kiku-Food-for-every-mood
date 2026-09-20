export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function getStandaloneRoute(): "login" | "signup" | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const hash = window.location.hash;
  if (path === "/login" || hash === "#login") return "login";
  if (path === "/signup" || hash === "#signup") return "signup";
  return null;
}
