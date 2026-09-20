import { useState } from "react";
import { getKikuProfile, saveKikuProfile } from "../../stores/profile-store";
import { AuthLayout, GoogleButton, AuthIcon } from "../../components/auth/AuthShared";

export default function LoginPage({ darkMode, setDarkMode, onSuccess, onSignup, onSkip }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const complete = (profile) => {
    const current = getKikuProfile();
    saveKikuProfile({
      ...current,
      ...profile,
      name: profile.name || current.name || "Kiku member",
    });
    localStorage.setItem("kiku-authenticated", "true");
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true } }));
    onSuccess?.();
  };

  const submit = (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    complete({ email: email.trim() });
  };

  return (
    <AuthLayout
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      eyebrow="WELCOME BACK"
      title="Come back to what feels good."
      subtitle="Sign in to keep your saved dishes, preferences, recipes, and Kiku experience together on this device."
      alternate={<><span>New here?</span> <button type="button" onClick={onSignup}>Create your Kiku space</button></>}
      footerCopy="Skip sign-in whenever you like — Kiku can still help you explore."
      onSkip={onSkip}
    >
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="lock" /></span><div><strong>Sign in</strong><span>Pick up where you left off.</span></div></div>
      <form className="kiku-auth-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
        {error && <p className="kiku-auth-error" role="alert">{error}</p>}
        <button className="kiku-auth-primary" type="submit">Sign in</button>
      </form>
      <div className="kiku-auth-divider"><span>or</span></div>
      <GoogleButton onSuccess={complete} onError={setError} />
    </AuthLayout>
  );
}

