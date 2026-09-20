import { useState } from "react";
import { clearKikuUserData } from "../../stores/profile-store";

export default function ProfilePrivacyPage({ onBack, onDeleted }) {
  const [confirming, setConfirming] = useState(false);

  const deleteData = () => {
    clearKikuUserData();
    setConfirming(false);
    onDeleted();
  };

  return (
    <section className="kiku-subpage" aria-label="Mood and privacy">
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
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
    </section>
  );
}
