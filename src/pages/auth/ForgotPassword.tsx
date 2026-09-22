import { useState } from "react";
import { api } from "../../services/api";
import { AuthLayout, AuthIcon } from "../../components/auth/AuthShared";

export default function ForgotPasswordPage({ darkMode, setDarkMode, onBack }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setMessage("");
    if (!email.trim()) { setError("Enter the email linked to your Kiku account."); return; }
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setMessage("If an account exists for that email, Kiku has sent password reset instructions.");
    } catch (nextError) {
      setError(nextError.message || "Unable to request a reset right now.");
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout darkMode={darkMode} setDarkMode={setDarkMode} eyebrow="RESET ACCESS" title="Let's get you back in." subtitle="Enter your Kiku email and we'll send a secure reset link when an account matches it." alternate={<><span>Remembered it?</span> <button type="button" onClick={onBack}>Back to sign in</button></>} footerCopy="Reset links expire and can only be used once." onSkip={onBack}>
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="lock" /></span><div><strong>Forgot password?</strong><span>We'll help you get back to your account.</span></div></div>
      <form className="kiku-auth-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        {error && <p className="kiku-auth-error" role="alert">{error}</p>}
        {message && <p className="kiku-auth-success" role="status">{message}</p>}
        <button className="kiku-auth-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      </form>
    </AuthLayout>
  );
}
