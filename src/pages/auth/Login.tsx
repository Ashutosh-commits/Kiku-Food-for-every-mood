import { useState } from "react";
import { api } from "../../services/api";
import { hydrateKikuUserState } from "../../stores/profile-store";
import { AuthLayout, GoogleButton, AuthIcon } from "../../components/auth/AuthShared";

export default function LoginPage({ darkMode, setDarkMode, onSuccess, onSignup, onSkip }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const complete = async (user) => {
    await hydrateKikuUserState();
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true, user } }));
    onSuccess?.();
  };

  const forgot = () => { window.history.pushState({}, "", "/forgot-password"); window.dispatchEvent(new PopStateEvent("popstate")); };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Enter your email and password to continue."); return; }
    setBusy(true);
    try { const result = await api.login({ email: email.trim(), password }); await complete(result.user); }
    catch (nextError) { setError(nextError.message || "Unable to sign in."); }
    finally { setBusy(false); }
  };

  const google = async (credential) => {
    setError(""); setBusy(true);
    try { const result = await api.google(credential); await complete(result.user); }
    catch (nextError) { setError(nextError.message || "Google sign-in failed."); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      eyebrow="WELCOME BACK"
      title="Come back to what feels good."
      subtitle="Sign in to keep your saved dishes, preferences, recipes, and Kiku experience together across your devices."
      alternate={<><span>New here?</span> <button type="button" onClick={onSignup}>Create your Kiku space</button></>}
      footerCopy="Skip sign-in whenever you like — Kiku can still help you explore."
      onSkip={onSkip}
    >
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="lock" /></span><div><strong>Sign in</strong><span>Pick up where you left off.</span></div></div>
      <form className="kiku-auth-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
        <div className="kiku-auth-inline-row"><button type="button" className="kiku-auth-inline-link" onClick={forgot}>Forgot password?</button></div>
        {error && <p className="kiku-auth-error" role="alert">{error}</p>}
        <button className="kiku-auth-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="kiku-auth-divider"><span>or</span></div>
      <GoogleButton onSuccess={google} onError={setError} disabled={busy} />
    </AuthLayout>
  );
}
