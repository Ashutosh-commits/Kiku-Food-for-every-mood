const content = {
  about: {
    eyebrow: "ABOUT KIKU",
    title: "Food for every mood.",
    intro: "Kiku helps you move from a feeling or craving to a dish, a restaurant, a price comparison, or a recipe you can cook at home.",
    sections: [
      ["Discover", "Explore dishes and restaurants that match your moment."],
      ["Compare", "See current menu prices Kiku can verify for the same dish across supported platforms."],
      ["Cook", "Open recipe pages and guided cooking mode when you'd rather make it yourself."],
    ],
  },
  privacy: {
    eyebrow: "PRIVACY",
    title: "Clear, secure, and in your hands.",
    intro: "Kiku stores account-backed settings and saved choices on your secure account, while camera frames remain local to the device during a mood scan.",
    sections: [
      ["Account data", "Profile details, saved items, preferences, activity, and assistant history are associated with your Kiku account."],
      ["Mood choices", "Manual mood and expression signals can personalize recommendations without uploading raw camera frames."],
      ["Delete anytime", "Use Mood & Privacy in Profile & Settings to delete your Kiku account data."],
    ],
  },
  support: {
    eyebrow: "SUPPORT",
    title: "Need a hand? Kiku is here.",
    intro: "Find answers about saving dishes, changing preferences, using the assistant, and moving between recipe and cooking mode.",
    sections: [
      ["Ask Kiku", "Open the assistant for quick dish ideas based on your craving and saved preferences."],
      ["Profile & Settings", "Edit your details, update food preferences, manage saved items, or delete account data."],
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
