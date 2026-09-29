import { useState } from "react";
import { api } from "../../services/api";
import { hydrateKikuUserState } from "../../stores/profile-store";
import { AuthLayout, GoogleButton, AuthIcon } from "../../components/auth/AuthShared";

export default function SignupPage({ darkMode, setDarkMode, onSuccess, onLogin, onSkip }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const complete = async (user) => {
    await hydrateKikuUserState();
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true, user } }));
    onSuccess?.();
  };

  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (!name.trim() || !email.trim() || password.length < 8) { setError("Add your name, a valid email, and a password with at least 8 characters."); return; }
    setBusy(true);
    try { const result = await api.register({ name: name.trim(), email: email.trim(), password }); if (result.verificationRequired) { setVerificationSent(true); return; } await complete(result.user); }
    catch (nextError) { setError(nextError.message || "Unable to create your account."); }
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
      eyebrow="MAKE IT PERSONAL"
      title="Your food journey, your way."
      subtitle="Create your Kiku account so your preferences, saved choices, and recommendations stay with you across devices."
      alternate={<><span>Already have a Kiku space?</span> <button type="button" onClick={onLogin}>Sign in</button></>}
      footerCopy="You can still skip this and explore Kiku without an account."
      onSkip={onSkip}
    >
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="user" /></span><div><strong>Create your account</strong><span>Your Kiku data is synced securely to your account.</span></div></div>
      <form className="kiku-auth-form" onSubmit={submit}>
        <label>Your name<input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should Kiku call you?" required /></label>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
        {error && <p className="kiku-auth-error" role="alert">{error}</p>}
        {verificationSent && <p className="kiku-auth-success" role="status">Your account was created. Check your email for the verification link, then sign in.</p>}
        <button className="kiku-auth-primary" type="submit" disabled={busy || verificationSent}>{verificationSent ? "Verification email sent" : busy ? "Creating…" : "Create account"}</button>
      </form>
      <div className="kiku-auth-divider"><span>or</span></div>
      <GoogleButton onSuccess={google} onError={setError} disabled={busy} />
    </AuthLayout>
  );
}
