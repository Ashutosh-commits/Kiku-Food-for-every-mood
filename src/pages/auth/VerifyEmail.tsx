import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { AuthLayout, AuthIcon } from "../../components/auth/AuthShared";

export default function VerifyEmailPage({ darkMode, setDarkMode, onDone }) {
  const [status, setStatus] = useState("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) { setStatus("error"); setError("This verification link is missing or invalid."); return; }
    api.verifyEmail(token).then(() => setStatus("success")).catch((nextError) => { setStatus("error"); setError(nextError.message || "This verification link is invalid or expired."); });
  }, []);

  return (
    <AuthLayout darkMode={darkMode} setDarkMode={setDarkMode} eyebrow="VERIFY EMAIL" title={status === "success" ? "You're all set." : "Let's verify that email."} subtitle={status === "success" ? "Your Kiku account is now verified." : "We're checking your secure verification link."} alternate={<><span>Ready to continue?</span> <button type="button" onClick={onDone}>Back to sign in</button></>} footerCopy="Verification links are single-use and expire for your security." onSkip={onDone}>
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="user" /></span><div><strong>{status === "verifying" ? "Checking link…" : status === "success" ? "Email verified" : "Verification failed"}</strong><span>{status === "success" ? "Your account can now use verified-email features." : ""}</span></div></div>
      {status === "error" && <p className="kiku-auth-error" role="alert">{error}</p>}
      {status === "success" && <p className="kiku-auth-success" role="status">Your email address is verified.</p>}
      <button className="kiku-auth-primary" type="button" onClick={onDone} disabled={status === "verifying"}>{status === "success" ? "Continue to Kiku" : "Back to sign in"}</button>
    </AuthLayout>
  );
}
