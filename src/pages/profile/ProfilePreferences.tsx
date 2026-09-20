import { useState } from "react";
import { getKikuPreferences, saveKikuPreferences } from "../../stores/profile-store";

const dietaryOptions = ["Vegetarian", "Vegan", "No Eggs", "Healthy", "Quick", "Comfort food", "Spicy", "Sweet"];
const allergyOptions = ["Nuts", "Dairy", "Eggs", "Gluten", "Soy"];

export default function ProfilePreferencesPage({ onBack }) {
  const [preferences, setPreferences] = useState(getKikuPreferences);
  const toggle = (group, value) => {
    setPreferences((current) => {
      const set = new Set(current[group]);
      if (set.has(value)) set.delete(value); else set.add(value);
      return { ...current, [group]: [...set] };
    });
  };

  const save = () => {
    saveKikuPreferences(preferences);
    onBack();
  };

  return (
    <section className="kiku-subpage" aria-label="Food preferences">
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span className="eyebrow">PREFERENCES</span><h1>Food preferences</h1><p>Tell Kiku what you enjoy and what you avoid so recommendations can feel more personal.</p></div>
      </div>

      <div className="profile-preference-card">
        <div className="profile-choice-section"><div><span className="eyebrow">DIETARY &amp; STYLE</span><h2>What fits you?</h2></div><p>These choices help Kiku rank dishes and recipes around the foods you already enjoy.</p></div>
        <div className="profile-choice-grid">
          {dietaryOptions.map((option) => <button type="button" key={option} className={`profile-choice ${preferences.dietary.includes(option) ? "active" : ""}`} onClick={() => toggle("dietary", option)}>{option}</button>)}
        </div>
      </div>

      <div className="profile-preference-card">
        <div className="profile-choice-section"><div><span className="eyebrow">ALLERGIES</span><h2>What should Kiku avoid?</h2></div><p>Kiku uses these saved signals when filtering recommendations. Always verify ingredients with the restaurant before ordering.</p></div>
        <div className="profile-choice-grid">
          {allergyOptions.map((option) => <button type="button" key={option} className={`profile-choice ${preferences.allergies.includes(option) ? "active" : ""}`} onClick={() => toggle("allergies", option)}>{option}</button>)}
        </div>
      </div>

      <div className="profile-preference-save"><button type="button" className="kiku-primary-button" onClick={save}>Save preferences</button></div>
    </section>
  );
}
