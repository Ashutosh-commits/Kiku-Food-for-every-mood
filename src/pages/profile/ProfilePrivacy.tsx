import { useState } from "react";
import { clearKikuUserData } from "../../stores/profile-store";

export default function ProfilePrivacyPage({ onBack, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
<<<<<<< HEAD
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const deleteData = async () => {
    setBusy(true);
    setError("");
    try {
      await clearKikuUserData();
      setConfirming(false);
      onDeleted();
    } catch (nextError) {
      setError(nextError?.message || "Kiku could not delete your account data right now. Nothing was changed.");
    } finally {
      setBusy(false);
    }
=======

  const deleteData = () => {
    clearKikuUserData();
    setConfirming(false);
    onDeleted();
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  };

  return (
    <section className="kiku-subpage" aria-label="Mood and privacy">
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
<<<<<<< HEAD
        <div>
          <span className="eyebrow">MOOD &amp; PRIVACY</span>
          <h1>Your data, your choice.</h1>
          <p>Manage the information Kiku uses to personalize your experience, understand what the mood scan does, and permanently remove the data tied to your account.</p>
        </div>
      </div>

      <div className="profile-privacy-intro">
        <p>Kiku keeps authenticated account information on the backend so your preferences, saved items, activity, and assistant history can travel with your account. The optional mood scan is designed for on-device expression inference; raw camera frames are not uploaded or persisted by the scan flow.</p>
        <div className="profile-privacy-list">
          <div className="profile-privacy-item"><span>01</span><div><strong>Account-backed personalization</strong><p>Your saved food, preferences, and observed Kiku activity can influence future recommendations.</p></div></div>
          <div className="profile-privacy-item"><span>02</span><div><strong>Expression stays a signal</strong><p>Kiku treats a scan as an expression signal, never as certainty about your internal emotional state.</p></div></div>
          <div className="profile-privacy-item"><span>03</span><div><strong>Deletion is account-wide</strong><p>Deleting your data removes the account records Kiku stores for you and clears your active session.</p></div></div>
        </div>
      </div>

      <div className="profile-privacy-grid">
        <article className="profile-privacy-card"><span className="profile-privacy-icon">⌂</span><h2>What is stored</h2><p>Your profile, food preferences, saved dishes, saved restaurants, saved recipes, first-party activity, assistant conversations, and PIN discovery hint can be associated with your account.</p></article>
        <article className="profile-privacy-card"><span className="profile-privacy-icon">✦</span><h2>What is not stored by the scan</h2><p>Kiku's mood-scan flow does not upload or persist raw camera frames. The result is reduced to an expression signal and confidence that can influence recommendations.</p></article>
      </div>

      <div className="profile-delete-card">
        <div className="profile-delete-copy">
          <span className="eyebrow">PERMANENT ACCOUNT ACTION</span>
          <h2>Delete my Kiku data</h2>
          <p>This removes your Kiku account and the account-backed data Kiku stores for it. The active session is cleared and you will be signed out immediately after a successful deletion.</p>
          <div className="profile-delete-meta" aria-label="Data removed by account deletion">
            <span>Profile</span><span>Preferences</span><span>Saved items</span><span>Activity</span><span>Assistant history</span><span>Sessions</span>
          </div>
        </div>
        <button type="button" className="profile-danger-button" onClick={() => setConfirming(true)}>Delete my data</button>
      </div>

      {error && <p className="kiku-form-error" role="alert">{error}</p>}

      {confirming && (
        <div className="profile-warning-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirming(false); }}>
          <div className="profile-warning-card" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-warning" aria-describedby="profile-delete-description">
            <span className="eyebrow">PLEASE CONFIRM</span>
            <h2 id="profile-delete-warning">Delete your Kiku account?</h2>
            <p id="profile-delete-description">This action cannot be undone. Kiku will remove the account-backed data listed below, clear the active session, and sign you out after the deletion succeeds.</p>
            <div className="profile-warning-checklist">
              <div><span>✓</span><span>Profile and account information</span></div>
              <div><span>✓</span><span>Food preferences and PIN discovery hint</span></div>
              <div><span>✓</span><span>Saved dishes, restaurants, and recipes</span></div>
              <div><span>✓</span><span>Observed activity and recommendation history</span></div>
              <div><span>✓</span><span>Assistant conversations and active sessions</span></div>
            </div>
            <div className="profile-warning-actions">
              <button type="button" className="kiku-secondary-button" onClick={() => setConfirming(false)} disabled={busy}>Keep my data</button>
              <button type="button" className="profile-danger-button" onClick={deleteData} disabled={busy}>{busy ? "Deleting & signing you out…" : "Delete everything"}</button>
            </div>
          </div>
        </div>
      )}
=======
        <div><span className="eyebrow">MOOD &amp; PRIVACY</span><h1>Your data, your choice.</h1><p>Kiku keeps your profile, saved items, preferences, and mood choices on this device.</p></div>
      </div>

      <div className="profile-privacy-grid">
        <article className="profile-privacy-card"><span className="profile-privacy-icon">⌂</span><h2>Stored locally</h2><p>Your Kiku profile and personal settings stay in your browser's local storage for this experience.</p></article>
        <article className="profile-privacy-card"><span className="profile-privacy-icon">✦</span><h2>Mood privacy</h2><p>Mood choices are used to shape the recommendations you see. You can clear that stored data at any time.</p></article>
      </div>

      <div className="profile-delete-card">
        <div><span className="eyebrow">RESET YOUR KIKU DATA</span><h2>Delete my local data</h2><p>This removes your saved dishes and recipes, profile photo and name, preferences, and local sign-in state from this device.</p></div>
        <button type="button" className="profile-danger-button" onClick={() => setConfirming(true)}>Delete my data</button>
      </div>

      {confirming && <div className="profile-warning-backdrop" role="presentation"><div className="profile-warning-card" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-warning"><span className="eyebrow">PLEASE CONFIRM</span><h2 id="profile-delete-warning">Delete all Kiku data?</h2><p>This cannot be undone on this device. Kiku will forget your local profile, saved items, food preferences, and local sign-in state.</p><div className="profile-warning-actions"><button type="button" className="kiku-secondary-button" onClick={() => setConfirming(false)}>Keep my data</button><button type="button" className="profile-danger-button" onClick={deleteData}>Delete everything</button></div></div></div>}
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
    </section>
  );
}
