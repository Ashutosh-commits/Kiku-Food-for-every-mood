import { useMemo, useState } from "react";
import { api } from "../../services/api";
import { AuthLayout, AuthIcon } from "../../components/auth/AuthShared";

export default function ResetPasswordPage({ darkMode, setDarkMode, onDone }) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (!token) { setError("This reset link is missing or invalid."); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirm) { setError("Your passwords do not match."); return; }
    setBusy(true);
    try { await api.resetPassword(token, password); setDone(true); }
    catch (nextError) { setError(nextError.message || "This reset link is invalid or expired."); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout darkMode={darkMode} setDarkMode={setDarkMode} eyebrow="NEW PASSWORD" title="Choose something secure." subtitle="Set a new password for your Kiku account. Your old sessions will be signed out after the reset." alternate={<><span>Back to Kiku?</span> <button type="button" onClick={onDone}>Sign in</button></>} footerCopy="Use a password you do not reuse on other sites." onSkip={onDone}>
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="lock" /></span><div><strong>Reset password</strong><span>One secure step and you're back in.</span></div></div>
      {!done ? (
        <form className="kiku-auth-form" onSubmit={submit}>
          <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" required /></label>
          {error && <p className="kiku-auth-error" role="alert">{error}</p>}
          <button className="kiku-auth-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
        </form>
      ) : (
        <div className="kiku-auth-form"><p className="kiku-auth-success" role="status">Your password has been reset. Sign in with your new password.</p><button className="kiku-auth-primary" type="button" onClick={onDone}>Back to sign in</button></div>
      )}
    </AuthLayout>
  );
}
