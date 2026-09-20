import { useEffect, useRef, useState } from "react";
import { getKikuProfile, saveKikuProfile } from "../../stores/profile-store";
import { ThemeIcon } from "../icons/ui-icons";

export function AuthIcon({ type }: { type: string }) {
  if (type === "lock") return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (type === "user") return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7" r="3.5" /><path d="M5.2 21c.8-4 3-6 6.8-6s6 2 6.8 6" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" /></svg>;
}

function useGoogleIdentity(onSuccess, onError) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  const initialized = useRef(false);
  const callbackRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  callbackRef.current = onSuccess;
  errorRef.current = onError;

  useEffect(() => {
    if (!clientId) return undefined;
    if (document.querySelector('script[data-kiku-google="true"]')) return undefined;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.kikuGoogle = "true";
    script.onerror = () => errorRef.current?.("Google sign-in could not be loaded.");
    document.head.appendChild(script);
    return () => {};
  }, [clientId]);

  const signIn = () => {
    if (!clientId) {
      errorRef.current?.("Google sign-in is ready for configuration. Add VITE_GOOGLE_CLIENT_ID to enable the live Google flow.");
      return;
    }
    const start = () => {
      if (!window.google?.accounts?.id) {
        errorRef.current?.("Google sign-in is still loading. Please try again.");
        return;
      }
      if (!initialized.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            try {
              const parts = response.credential.split(".");
              const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
              callbackRef.current?.({
                name: payload.name || payload.given_name || "Google member",
                email: payload.email || "",
                avatar: payload.picture || null,
                provider: "google",
              });
            } catch {
              errorRef.current?.("Google sign-in returned an unreadable response.");
            }
          },
          ux_mode: "popup",
          auto_select: false,
        });
        initialized.current = true;
      }
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.()) {
          window.google.accounts.id.renderButton(document.getElementById("kiku-google-render"), {
            theme: "outline",
            size: "large",
            width: 320,
            text: "continue_with",
          });
        }
      });
    };
    if (window.google?.accounts?.id) start();
    else window.setTimeout(start, 600);
  };

  return { clientId, signIn };
}

export function AuthLayout({ darkMode, setDarkMode, eyebrow, title, subtitle, children, footerCopy, alternate, onSkip }) {
  return (
    <main className={`landing-page kiku-auth-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="kiku-auth-backdrop" aria-hidden="true" />
      <header className="kiku-auth-header">
        <button type="button" className="kiku-auth-logo" onClick={onSkip} aria-label="Back to Kiku">
          <img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" />
        </button>
        <div className="kiku-auth-header-actions">
          <button type="button" className="kiku-auth-theme" onClick={() => setDarkMode((value) => !value)} aria-label="Toggle theme"><ThemeIcon dark={darkMode} /></button>
          <button type="button" className="kiku-auth-skip" onClick={onSkip}>Skip for now</button>
        </div>
      </header>

      <section className="kiku-auth-shell">
        <div className="kiku-auth-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="kiku-auth-trust">
            <span>⌁</span>
            <p>Your Kiku preferences stay on this device. Your PIN is used only to keep suggestions focused on your area.</p>
          </div>
        </div>
        <div className="kiku-auth-card">
          {children}
          <p className="kiku-auth-alternate">{alternate}</p>
          <p className="kiku-auth-footer-copy">{footerCopy}</p>
        </div>
      </section>
    </main>
  );
}

export function GoogleButton({ onSuccess, onError }) {
  const { clientId, signIn } = useGoogleIdentity(onSuccess, onError);
  const googleButtonRef = useRef(null);
  const [officialReady, setOfficialReady] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return false;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(360, googleButtonRef.current.clientWidth || 360),
        logo_alignment: "left",
      });
      setOfficialReady(true);
      return true;
    };
    if (window.google?.accounts?.id) render();
    else {
      const timer = window.setInterval(() => { if (render()) window.clearInterval(timer); }, 300);
      return () => { cancelled = true; window.clearInterval(timer); };
    }
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <>
      {clientId && <div ref={googleButtonRef} className={`kiku-google-render ${officialReady ? "ready" : ""}`} aria-label="Continue with Google" />}
      {!clientId && (
        <button type="button" className="kiku-google-button" onClick={signIn}>
          <span className="kiku-google-mark" aria-hidden="true">G</span>
          <span>Continue with Google</span>
        </button>
      )}
      {!clientId && <span className="kiku-auth-config-note">Add VITE_GOOGLE_CLIENT_ID to enable live Google sign-in on deployment.</span>}
    </>
  );
}
