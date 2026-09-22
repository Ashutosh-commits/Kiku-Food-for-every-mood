import { config } from "./config.js";

export async function sendAuthEmail({ to, type, token }) {
  const paths = {
    verify_email: `/verify-email?token=${encodeURIComponent(token)}`,
    reset_password: `/reset-password?token=${encodeURIComponent(token)}`,
  };
  const url = new URL(paths[type] || "/", `${config.publicAppUrl.replace(/\/$/, "")}/`).toString();
  const payload = { to, type, actionUrl: url, product: "Kiku" };

  if (config.emailWebhookUrl) {
    const response = await fetch(config.emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Email delivery service returned ${response.status}.`);
    return true;
  }

  if (config.requireEmailVerification) throw new Error("Email delivery is not configured.");
  if (config.nodeEnv !== "production") console.info(JSON.stringify({ level: "info", message: "Auth email preview", ...payload }));
  return false;
}
