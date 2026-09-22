import { useState } from "react";
<<<<<<< HEAD
import type { KikuPreferences } from "../../types";
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
import { getKikuPreferences, saveKikuPreferences } from "../../stores/profile-store";

const dietaryOptions = ["Vegetarian", "Vegan", "No Eggs", "Healthy", "Quick", "Comfort food", "Spicy", "Sweet"];
const allergyOptions = ["Nuts", "Dairy", "Eggs", "Gluten", "Soy"];
<<<<<<< HEAD
const cuisineOptions = ["Indian", "Italian", "Chinese", "Thai", "Japanese", "Mexican", "Continental"];
const spiceOptions: Array<{ value: KikuPreferences["spiceLevel"]; label: string }> = [
  { value: null, label: "Any spice level" },
  { value: "mild", label: "Mild" },
  { value: "medium", label: "Medium" },
  { value: "spicy", label: "Spicy" },
];

const numberValue = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc

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
<<<<<<< HEAD
    const budgetMin = preferences.budgetMin == null ? null : Math.min(preferences.budgetMin, preferences.budgetMax ?? preferences.budgetMin);
    const budgetMax = preferences.budgetMax == null ? null : Math.max(preferences.budgetMin ?? 0, preferences.budgetMax);
    saveKikuPreferences({ ...preferences, budgetMin, budgetMax });
=======
    saveKikuPreferences(preferences);
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
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
<<<<<<< HEAD
        <div className="profile-choice-section"><div><span className="eyebrow">CUISINES</span><h2>What do you reach for?</h2></div><p>Select cuisines Kiku should favor when it builds personalized recommendations.</p></div>
        <div className="profile-choice-grid">
          {cuisineOptions.map((option) => <button type="button" key={option} className={`profile-choice ${preferences.cuisines.includes(option) ? "active" : ""}`} onClick={() => toggle("cuisines", option)}>{option}</button>)}
        </div>
      </div>

      <div className="profile-preference-card">
        <div className="profile-choice-section"><div><span className="eyebrow">SPICE</span><h2>How much heat?</h2></div><p>This is a ranking preference, not a guarantee about how spicy a provider's dish will be.</p></div>
        <div className="profile-choice-grid">
          {spiceOptions.map((option) => <button type="button" key={String(option.value)} className={`profile-choice ${preferences.spiceLevel === option.value ? "active" : ""}`} onClick={() => setPreferences((current) => ({ ...current, spiceLevel: option.value }))}>{option.label}</button>)}
        </div>
      </div>

      <div className="profile-preference-card">
        <div className="profile-choice-section"><div><span className="eyebrow">BUDGET</span><h2>What feels comfortable?</h2></div><p>Set an optional price range for recommendation ranking. Prices are always provider-listed values, not checkout totals.</p></div>
        <div className="profile-budget-grid">
          <label>Minimum budget<input type="number" min="0" max="100000" inputMode="numeric" value={preferences.budgetMin ?? ""} onChange={(event) => setPreferences((current) => ({ ...current, budgetMin: numberValue(event.target.value) }))} placeholder="₹0" /></label>
          <label>Maximum budget<input type="number" min="0" max="100000" inputMode="numeric" value={preferences.budgetMax ?? ""} onChange={(event) => setPreferences((current) => ({ ...current, budgetMax: numberValue(event.target.value) }))} placeholder="₹500" /></label>
        </div>
      </div>

      <div className="profile-preference-card">
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
        <div className="profile-choice-section"><div><span className="eyebrow">ALLERGIES</span><h2>What should Kiku avoid?</h2></div><p>Kiku uses these saved signals when filtering recommendations. Always verify ingredients with the restaurant before ordering.</p></div>
        <div className="profile-choice-grid">
          {allergyOptions.map((option) => <button type="button" key={option} className={`profile-choice ${preferences.allergies.includes(option) ? "active" : ""}`} onClick={() => toggle("allergies", option)}>{option}</button>)}
        </div>
      </div>

      <div className="profile-preference-save"><button type="button" className="kiku-primary-button" onClick={save}>Save preferences</button></div>
    </section>
  );
}
