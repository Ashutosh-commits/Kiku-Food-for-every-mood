import { useState } from "react";
import { saveKikuProfile } from "../../stores/profile-store";
import { AuthLayout, GoogleButton, AuthIcon } from "../../components/auth/AuthShared";

export default function SignupPage({ darkMode, setDarkMode, onSuccess, onLogin, onSkip }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const complete = (profile) => {
    saveKikuProfile({ name: profile.name || name.trim() || "Kiku member", email: profile.email || email.trim(), avatar: profile.avatar || null });
    localStorage.setItem("kiku-authenticated", "true");
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true } }));
    onSuccess?.();
  };

  const submit = (event) => {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Add your name, a valid email, and a password with at least 6 characters.");
      return;
    }
    complete({ name: name.trim(), email: email.trim() });
  };

  return (
    <AuthLayout
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      eyebrow="MAKE IT PERSONAL"
      title="Your food journey, your way."
      subtitle="Create a local Kiku profile so your preferences, saved choices, and recommendations can feel more personal."
      alternate={<><span>Already have a Kiku space?</span> <button type="button" onClick={onLogin}>Sign in</button></>}
      footerCopy="You can still skip this and explore Kiku without an account."
      onSkip={onSkip}
    >
      <div className="kiku-auth-card-heading"><span className="kiku-auth-icon"><AuthIcon type="user" /></span><div><strong>Create your account</strong><span>Your profile stays local to this browser.</span></div></div>
      <form className="kiku-auth-form" onSubmit={submit}>
        <label>Your name<input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should Kiku call you?" /></label>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
        {error && <p className="kiku-auth-error" role="alert">{error}</p>}
        <button className="kiku-auth-primary" type="submit">Create account</button>
      </form>
      <div className="kiku-auth-divider"><span>or</span></div>
      <GoogleButton onSuccess={complete} onError={setError} />
    </AuthLayout>
  );
}
