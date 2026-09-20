import { useEffect, useState } from "react";
import ProfileEditPage from "./ProfileEdit";
import ProfileSavedPage from "./ProfileSaved";
import ProfilePreferencesPage from "./ProfilePreferences";
import ProfilePrivacyPage from "./ProfilePrivacy";
import ProfileInfoPage from "./ProfileInfo";
import { getKikuProfile } from "../../stores/profile-store";
import { AssistantIcon, PersonIcon, ThemeIcon } from "../../components/icons/ui-icons";

function ProfileSettingIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };
  if (name === "heart") return <svg {...common}><path d="M20.8 8.6c0 5.2-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.6A4.5 4.5 0 0 1 12 6.1a4.5 4.5 0 0 1 8.8 2.5Z" /></svg>;
  if (name === "food") return <svg {...common}><path d="M7 3v8M4.5 3v5.5a2.5 2.5 0 0 0 5 0V3M7 10.5V21M17 3v18M14.5 10.5H19c0-3.2-.9-5.8-2-7.5" /></svg>;
  if (name === "privacy") return <svg {...common}><path d="M12 3 20 6v5.3c0 5.1-3.2 8.4-8 9.7-4.8-1.3-8-4.6-8-9.7V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "help") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9.2a2.5 2.5 0 1 1 4 2c-1.2.8-1.8 1.3-1.8 2.8M12 17.2h.01" /></svg>;
  return <PersonIcon />;
}

function ProfileAuthGate({ darkMode, onLogin, onGetStarted, onBack }) {
  return (
    <main className={`landing-page profile-page profile-auth-page ${darkMode ? "dark-mode" : ""}`}>
      <section className="profile-auth-screen" aria-label="Kiku login and signup">
        <button type="button" className="profile-auth-back" onClick={onBack} aria-label="Back to Kiku">‹</button>
        <div className="profile-auth-card">
          <img className="profile-auth-logo" src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" />
          <span className="eyebrow">YOUR KIKU SPACE</span>
          <h1>Make your food journey yours.</h1>
          <p>Log in to access your profile, saved dishes, preferences, and Kiku settings — or get started to create your account.</p>
          <div className="profile-auth-actions">
            <button type="button" className="profile-auth-button profile-auth-login" onClick={() => onLogin?.("profile")}>Log in</button>
            <button type="button" className="profile-auth-button profile-auth-signup" onClick={() => onGetStarted?.("profile")}>Get started</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ProfilePage({ isLoggedIn, darkMode, setDarkMode, onClose, onSignOut, onOpenAssistant, onOpenDish, onOpenRecipe, onLogin, onGetStarted, onDeleted }) {
  const [subroute, setSubroute] = useState(() => window.location.hash.split("/")[1] || "home");
  const [profile, setProfile] = useState(getKikuProfile);

  useEffect(() => {
    const sync = () => setSubroute(window.location.hash.split("/")[1] || "home");
    const profileSync = (event) => setProfile(event.detail || getKikuProfile());
    window.addEventListener("hashchange", sync);
    window.addEventListener("kiku-profile-change", profileSync);
    sync();
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("kiku-profile-change", profileSync);
    };
  }, []);

  if (!isLoggedIn) return <ProfileAuthGate darkMode={darkMode} onLogin={onLogin} onGetStarted={onGetStarted} onBack={onClose} />;

  const go = (target) => {
    const nextHash = target === "home" ? "#profile" : `#profile/${target}`;
    window.location.hash = nextHash.replace(/^#/, "");
  };

  const title = {
    home: "Profile & Settings",
    edit: "Edit profile",
    saved: "Saved dishes & recipes",
    preferences: "Food preferences",
    privacy: "Mood & Privacy",
    about: "About Kiku",
    privacyInfo: "Privacy",
    support: "Support",
  }[subroute] || "Profile & Settings";

  const renderSubpage = () => {
    if (subroute === "edit") return <ProfileEditPage darkMode={darkMode} onBack={() => go("home")} />;
    if (subroute === "saved") return <ProfileSavedPage onBack={() => go("home")} onOpenDish={onOpenDish} onOpenRecipe={onOpenRecipe} />;
    if (subroute === "preferences") return <ProfilePreferencesPage onBack={() => go("home")} />;
    if (subroute === "privacy") return <ProfilePrivacyPage onBack={() => go("home")} onDeleted={onDeleted} />;
    if (subroute === "about") return <ProfileInfoPage type="about" onBack={() => go("home")} onOpenAssistant={onOpenAssistant} />;
    if (subroute === "privacyInfo") return <ProfileInfoPage type="privacy" onBack={() => go("home")} onOpenAssistant={onOpenAssistant} />;
    if (subroute === "support") return <ProfileInfoPage type="support" onBack={() => go("home")} onOpenAssistant={onOpenAssistant} />;
    return null;
  };

  return (
    <main className={`landing-page profile-page ${darkMode ? "dark-mode" : ""}`}>
      <section className="profile-screen" aria-label={title}>
        <header className="profile-screen-header">
          <button type="button" className="profile-back" onClick={() => subroute === "home" ? onClose() : go("home")} aria-label="Back"><span aria-hidden="true">‹</span></button>
          <button type="button" className="profile-brand" onClick={onClose} aria-label="Kiku home"><img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" /></button>
          <div className="profile-header-actions">
            <button type="button" className="profile-theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}><ThemeIcon dark={darkMode} /></button>
            <button type="button" className="profile-close" onClick={onClose} aria-label="Close profile">×</button>
          </div>
        </header>

        {subroute !== "home" ? (
          <div className="profile-subpage-shell">{renderSubpage()}</div>
        ) : (
          <div className="profile-layout">
            <aside className="profile-sidebar">
              <div className="profile-sidebar-brand"><img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" /><p>Food for every mood.</p></div>
              <div className="profile-sidebar-nav" aria-label="Profile sections">
                <button type="button" className="is-current"><PersonIcon /><span>Profile</span></button>
                <button type="button" onClick={() => go("preferences")}><span className="profile-nav-symbol">✦</span><span>Mood &amp; preferences</span></button>
                <button type="button" onClick={() => go("saved")}><span className="profile-nav-symbol">♡</span><span>Saved dishes</span></button>
                <button type="button" onClick={() => setDarkMode((value) => !value)}><ThemeIcon dark={darkMode} /><span>Appearance</span></button>
                <button type="button" onClick={onOpenAssistant}><AssistantIcon /><span>Ask Kiku</span></button>
              </div>
              <div className="profile-sidebar-links">
                <button type="button" onClick={() => go("about")}>About Kiku</button>
                <button type="button" onClick={() => go("privacyInfo")}>Privacy</button>
                <button type="button" onClick={() => go("support")}>Support</button>
              </div>
              <button type="button" className="profile-logout" onClick={onSignOut}><span aria-hidden="true">↪</span><span>Log out</span></button>
              <div className="profile-sidebar-quote"><span aria-hidden="true">✿</span><p>“Good food feels like home.”</p><small>— Kiku</small></div>
            </aside>

            <div className="profile-main">
              <div className="profile-main-heading"><div><span className="eyebrow">YOUR KIKU SPACE</span><h1>Profile &amp; Settings</h1><p>Keep your food preferences, mood choices, and Kiku experience in one place.</p></div></div>

              <section className="profile-card profile-identity-card">
                <div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile" /> : <PersonIcon />}</div>
                <div className="profile-identity-copy"><strong>{profile.name || "Kiku member"}</strong><span>Your local Kiku profile and personal food journey.</span></div>
                <button type="button" className="profile-edit-button" onClick={() => go("edit")}>Edit</button>
              </section>

              <section className="profile-card profile-settings-card">
                <div className="profile-card-heading"><span className="profile-card-heading-icon"><span aria-hidden="true">⚙</span></span><div><strong>Preferences</strong><span>Shape the recommendations you see</span></div></div>
                <button type="button" className="profile-setting-row" onClick={() => go("saved")}><span className="profile-setting-icon"><ProfileSettingIcon name="heart" /></span><span className="profile-setting-copy"><strong>Saved dishes &amp; recipes</strong><span>View everything you've liked and saved</span></span><span className="profile-setting-arrow">›</span></button>
                <button type="button" className="profile-setting-row" onClick={() => go("preferences")}><span className="profile-setting-icon"><ProfileSettingIcon name="food" /></span><span className="profile-setting-copy"><strong>Food preferences</strong><span>Dietary choices and allergies</span></span><span className="profile-setting-arrow">›</span></button>
                <button type="button" className="profile-setting-row" onClick={() => go("privacy")}><span className="profile-setting-icon"><ProfileSettingIcon name="privacy" /></span><span className="profile-setting-copy"><strong>Mood &amp; privacy</strong><span>Local data and mood settings</span></span><span className="profile-setting-arrow">›</span></button>
              </section>

              <section className="profile-card profile-settings-card">
                <div className="profile-card-heading"><span className="profile-card-heading-icon"><PersonIcon /></span><div><strong>Account &amp; experience</strong><span>Manage how Kiku behaves for you</span></div></div>
                <button type="button" className="profile-setting-row" onClick={() => setDarkMode((value) => !value)}><span className="profile-setting-icon"><ThemeIcon dark={darkMode} /></span><span className="profile-setting-copy"><strong>Appearance</strong><span>{darkMode ? "Dark mode enabled" : "Light mode enabled"}</span></span><span className="profile-setting-arrow">›</span></button>
                <button type="button" className="profile-setting-row" onClick={onOpenAssistant}><span className="profile-setting-icon"><AssistantIcon /></span><span className="profile-setting-copy"><strong>Ask Kiku</strong><span>Get recommendations from your preferences</span></span><span className="profile-setting-arrow">›</span></button>
              </section>

              <section className="profile-card profile-settings-card profile-help-card">
                <div className="profile-card-heading"><span className="profile-card-heading-icon">?</span><div><strong>Help &amp; about</strong><span>Learn about Kiku and get support</span></div></div>
                <button type="button" className="profile-setting-row" onClick={() => go("about")}><span className="profile-setting-icon">ⓘ</span><span className="profile-setting-copy"><strong>About Kiku</strong><span>What Kiku does and how it works</span></span><span className="profile-setting-arrow">›</span></button>
                <button type="button" className="profile-setting-row" onClick={() => go("privacyInfo")}><span className="profile-setting-icon">◌</span><span className="profile-setting-copy"><strong>Privacy</strong><span>How your local Kiku data is handled</span></span><span className="profile-setting-arrow">›</span></button>
                <button type="button" className="profile-setting-row" onClick={() => go("support")}><span className="profile-setting-icon">?</span><span className="profile-setting-copy"><strong>Support</strong><span>Answers, guidance, and Ask Kiku</span></span><span className="profile-setting-arrow">›</span></button>
              </section>

              <section className="profile-promo"><div className="profile-promo-copy"><span className="eyebrow">KEEP EXPLORING</span><h2>Good food, brighter days.</h2><p>Head back to Kiku and keep discovering what fits the moment.</p></div><button type="button" onClick={onClose}>Keep exploring <span aria-hidden="true">→</span></button></section>

              <button type="button" className="profile-mobile-logout" onClick={onSignOut}>
                <span aria-hidden="true">↪</span>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
