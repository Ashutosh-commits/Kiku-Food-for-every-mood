import { useEffect, useRef, useState } from "react";
import { getKikuProfile, resizeImageFileToDataUrl, saveKikuProfile } from "../../stores/profile-store";
import { PersonIcon } from "../../components/icons/ui-icons";

export default function ProfileEditPage({ darkMode, onBack }) {
  const [profile, setProfile] = useState(getKikuProfile);
  const [name, setName] = useState(profile.name || "Kiku member");
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const onChange = (event) => {
      if (event.detail) {
        setProfile(event.detail);
        setName(event.detail.name || "Kiku member");
        setAvatar(event.detail.avatar || null);
      }
    };
    window.addEventListener("kiku-profile-change", onChange);
    return () => window.removeEventListener("kiku-profile-change", onChange);
  }, []);

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 320);
      setAvatar(dataUrl);
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const save = () => {
    saveKikuProfile({ name, avatar });
    onBack();
  };

  return (
    <section className="kiku-subpage" aria-label="Edit Kiku profile">
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span className="eyebrow">ACCOUNT</span><h1>Edit profile</h1><p>Keep the details Kiku uses for your personal food journey.</p></div>
      </div>

      <div className="profile-edit-card">
        <div className="profile-edit-avatar-wrap">
          <div className="profile-edit-avatar">
            {avatar ? <img src={avatar} alt="Profile" /> : <PersonIcon />}
          </div>
          <button type="button" className="profile-upload-button" onClick={() => fileRef.current?.click()}>Change photo</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} hidden />
        </div>

        <label className="kiku-field">
          <span>Your name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Your name" />
        </label>

        <div className="profile-edit-note">
          <span className="profile-note-icon">✦</span>
<<<<<<< HEAD
          <p>Your profile details are stored securely with your Kiku account.</p>
=======
          <p>Your name and profile photo are stored locally on this device.</p>
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
        </div>
        {error && <p className="kiku-form-error">{error}</p>}

        <div className="kiku-subpage-actions">
          <button type="button" className="kiku-secondary-button" onClick={onBack}>Cancel</button>
          <button type="button" className="kiku-primary-button" onClick={save}>Save changes</button>
        </div>
      </div>
    </section>
  );
}
