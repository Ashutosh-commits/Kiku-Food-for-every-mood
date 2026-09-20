const content = {
  about: {
    eyebrow: "ABOUT KIKU",
    title: "Food for every mood.",
    intro: "Kiku helps you move from a feeling or craving to a dish, a restaurant, a price comparison, or a recipe you can cook at home.",
    sections: [
      ["Discover", "Explore dishes and restaurants that match your moment."],
      ["Compare", "See the price and delivery details Kiku has available for the same dish."],
      ["Cook", "Open recipe pages and guided cooking mode when you'd rather make it yourself."],
    ],
  },
  privacy: {
    eyebrow: "PRIVACY",
    title: "Clear, local, and in your hands.",
    intro: "Kiku's current profile experience stores personal settings and saved choices locally on your device.",
    sections: [
      ["Local storage", "Profile details, saved items, and preferences are kept in the browser for this experience."],
      ["Mood choices", "Your mood and preference selections are used to personalize recommendations on the device."],
      ["Delete anytime", "Use Mood & Privacy in Profile & Settings to clear the locally stored Kiku data."],
    ],
  },
  support: {
    eyebrow: "SUPPORT",
    title: "Need a hand? Kiku is here.",
    intro: "Find answers about saving dishes, changing preferences, using the assistant, and moving between recipe and cooking mode.",
    sections: [
      ["Ask Kiku", "Open the assistant for quick dish ideas based on your craving and saved preferences."],
      ["Profile & Settings", "Edit your details, update food preferences, manage saved items, or clear local data."],
      ["Still stuck?", "Use the Kiku navigation to return to Discover, Search, Mood, or Recipes and start again."],
    ],
  },
};

export default function ProfileInfoPage({ type, onBack, onOpenAssistant }) {
  const data = content[type] || content.about;
  return (
    <section className="kiku-subpage" aria-label={data.title}>
      <div className="kiku-subpage-header">
        <button type="button" className="kiku-subpage-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span className="eyebrow">{data.eyebrow}</span><h1>{data.title}</h1><p>{data.intro}</p></div>
      </div>

      <div className="profile-info-grid">
        {data.sections.map(([title, description], index) => <article key={title} className="profile-info-card"><span>0{index + 1}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}
      </div>
      {type === "support" && <button type="button" className="kiku-primary-button profile-info-cta" onClick={onOpenAssistant}>Ask Kiku</button>}
    </section>
  );
}
