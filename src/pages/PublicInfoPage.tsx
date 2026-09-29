import { useMemo } from "react";
import type { PublicInfoRoute } from "../utils/navigation";

type Section = { heading: string; body: string };
type PageContent = {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  sections: Section[];
  highlights?: string[];
};

const CONTENT: Record<Exclude<PublicInfoRoute, null>, PageContent> = {
  about: {
    eyebrow: "ABOUT KIKU",
    title: "Food for every mood.",
    intro: "Kiku is a food discovery companion built around a simple question: what should I eat right now? It brings discovery, mood signals, preferences, ordering options, recipes, and a conversational food assistant into one experience.",
    sections: [
      { heading: "A better starting point than a blank search box", body: "Kiku starts with the context people actually use when choosing food: a craving, a mood, a dietary choice, a cuisine preference, a budget, something they saved earlier, or a dish they simply want to explore. The goal is not to tell someone what they must eat. It is to narrow a very large choice into a few thoughtful options that fit the moment." },
      { heading: "Mood is a signal, not a diagnosis", body: "The optional mood scan is designed to produce an expression signal that can influence recommendations. Kiku does not treat a camera result as a definitive statement about someone's internal emotional state. People can always choose a mood manually and continue without the camera." },
      { heading: "One place to discover, order, and cook", body: "Kiku can surface dishes and restaurants, move from a dish idea into a recipe and guided cooking flow, and help you continue to the available restaurant experience. More ordering options are planned for future versions. External providers remain external: Kiku does not process restaurant payments, claim order completion, or provide rider tracking." },
      { heading: "Personalization that stays understandable", body: "The first recommendation system is deliberately deterministic and explainable. It uses explicit preferences and observed first-party activity alongside the current moment, so users can understand why a recommendation appeared. Over time, the architecture can evolve toward learned ranking without turning user histories into opaque model training data." },
    ],
    highlights: ["Optional expression scan", "Personalized food discovery", "Nearby restaurant discovery", "Recipe and cooking mode", "Kiku food assistant"],
  },
  privacy: {
    eyebrow: "PRIVACY POLICY",
    title: "Your data, clearly explained.",
    intro: "Kiku is designed so that account data, food preferences, saved items, activity, and assistant history are handled separately from optional on-device camera processing. This page explains the current product behavior in plain language.",
    updated: "Last updated: September 21, 2026",
    sections: [
      { heading: "What Kiku stores", body: "When you create an account, Kiku can store your profile details, food preferences, saved dishes, saved restaurants, saved recipes, first-party activity, and assistant conversations so the experience can follow you across sessions and devices. A PIN code can also be stored as a discovery hint when you provide one." },
      { heading: "What the mood scan does", body: "The camera is optional and is started only after an explicit action. Kiku's intended mood-scan architecture performs expression inference in the browser where supported. Raw camera frames are not uploaded or persisted by the Kiku scan flow. The resulting expression signal may be used as recommendation context and, where enabled, may be recorded as product activity without recording the raw image." },
      { heading: "How recommendations use data", body: "Recommendations can use explicit preferences, saved items, recent Kiku activity, manually selected mood, cravings, budget, and an optional expression signal. Kiku uses these signals to rank food options; it does not need direct access to a user's raw camera feed to do so." },
      { heading: "External providers", body: "Kiku may request food-provider or recipe data through its server-side provider layer. When you choose to continue to an external ordering provider, that provider controls its own ordering, delivery, payment, and location-processing experience. More ordering options may be added in future versions." },
      { heading: "Security", body: "Authenticated account data is protected by server-side sessions, authorization checks, input validation, rate limiting, security headers, and server-side provider credentials. Kiku's client should never be trusted as the source of truth for account ownership or permissions." },
      { heading: "Deleting your data", body: "Signed-in users can use Profile → Mood & Privacy → Delete my data. Kiku's account deletion flow removes the account-backed records that Kiku stores for that user and clears the active session. The interface confirms that deletion is irreversible and signs the user out after the operation succeeds." },
      { heading: "Your choices", body: "You can skip the mood scan, choose your mood manually, change food preferences, stop using external ordering links, or delete your account. Before a public launch, the deployment operator should also configure the final legal contact details, retention disclosures, and jurisdiction-specific notices that apply to the service." },
    ],
    highlights: ["Camera is optional", "Raw camera frames are not persisted by the scan flow", "Account deletion is available in-app", "External providers keep their own ordering data"],
  },
  terms: {
    eyebrow: "TERMS OF USE",
    title: "Use Kiku thoughtfully.",
    intro: "These terms describe the role Kiku is intended to play: a food discovery, recommendation, ordering, recipe, and conversational experience. They are written to match the current product boundaries rather than to imply services Kiku does not provide.",
    updated: "Last updated: September 21, 2026",
    sections: [
      { heading: "Kiku is a discovery service", body: "Kiku helps you explore dishes, restaurants, recipes, and ordering information. Recommendations are suggestions, not instructions or guarantees. You remain responsible for deciding what to eat, what ingredients are suitable for you, and whether a restaurant or dish meets your needs." },
      { heading: "Provider information can change", body: "Restaurant menus, availability, and details can change or differ from the provider page and final checkout. Kiku shows provider information as external data and does not process restaurant payments or claim order completion." },
      { heading: "External ordering", body: "Kiku can take you to an external ordering provider. Kiku does not process those payments, does not control delivery, and does not treat an order-link click as proof that an order was completed." },
      { heading: "Recipes and food information", body: "Recipes and food information are supplied for discovery and cooking guidance. Ingredients, substitutions, allergens, cooking conditions, and nutrition should be checked independently when they matter to you. Kiku does not replace professional dietary, medical, or food-safety advice." },
      { heading: "Accounts", body: "Keep your account credentials secure and provide information that you are authorized to use. Kiku may require verification or authentication checks before providing account features." },
      { heading: "Acceptable use", body: "Do not use Kiku to bypass access controls, overload provider services, submit malicious payloads, probe internal endpoints, automate arbitrary URL fetching, or interfere with another person's account or data. Provider-specific scraping and access are handled through controlled server-side adapters." },
      { heading: "Availability", body: "Kiku may be changed, paused, or temporarily unavailable while services, providers, or infrastructure are maintained. External provider availability is outside Kiku's direct control." },
    ],
  },
  accessibility: {
    eyebrow: "ACCESSIBILITY",
    title: "Designed to be easier to use.",
    intro: "Kiku's interface is built around clear hierarchy, readable text, keyboard-friendly controls, responsive layouts, visible focus states, and support for reduced motion. Accessibility remains an ongoing engineering responsibility rather than a one-time checklist.",
    sections: [
      { heading: "Keyboard and focus", body: "Interactive controls use native buttons or links wherever possible, with visible focus states and Escape handling for dialogs and overlays. Primary navigation, authentication, profile settings, and recipe controls are intended to remain usable without a pointer." },
      { heading: "Responsive design", body: "The same core journeys are designed to work across desktop and mobile layouts. The application adapts navigation, cards, dialogs, and profile settings rather than relying on a single fixed viewport." },
      { heading: "Motion", body: "Kiku uses motion to establish hierarchy and provide feedback, while honoring the user's reduced-motion preference where animations and transitions can safely be reduced." },
      { heading: "Camera features", body: "The mood scan is optional. Users can skip it entirely, use a manual mood instead, and close the scan when they choose. Camera access is requested through the browser's permission system rather than being silently enabled." },
      { heading: "Readable content", body: "Important actions use descriptive labels, status feedback, dialog titles, and concise helper text. Public information pages are structured with headings so users can scan topics without depending on visual styling alone." },
      { heading: "Continuous improvement", body: "Accessibility defects should be reported through the support route when encountered. Before a public launch, Kiku should continue with automated and manual audits covering keyboard navigation, contrast, screen-reader announcements, zoom, touch targets, and error recovery." },
    ],
  },
  support: {
    eyebrow: "SUPPORT",
    title: "A calmer way to get unstuck.",
    intro: "Most Kiku journeys can be completed without an account, while account features add saves, preferences, activity, and personalized recommendations. These notes cover the common paths and what to expect when something fails.",
    sections: [
      { heading: "Recommendations", body: "Start with a manual mood or the optional scan, add a craving and budget, and choose Find My Food. Guests receive contextual recommendations from the current session. Signed-in users can also benefit from saved items, preferences, and first-party activity." },
      { heading: "Ordering options", body: "Open a dish to explore the current restaurant experience. More ordering options are planned for future versions; Kiku does not process restaurant payments itself." },
      { heading: "Recipes", body: "Use Search in the Recipes section to find a recipe, open the recipe details, and switch into cooking mode when you are ready. Cooking timers are a recipe feature; they are separate from the recommendation engine." },
      { heading: "Account and privacy", body: "Profile and Settings lets you edit your profile, manage food preferences, view saved items, review privacy controls, and delete your Kiku account. Deleting the account signs you out after the deletion succeeds." },
      { heading: "If something goes wrong", body: "Provider outages, upstream price changes, expired sessions, network interruptions, or unavailable recipe sources can temporarily affect a feature. Kiku is designed to show an explicit unavailable state instead of silently presenting fabricated live data." },
    ],
  },
  "how-it-works": {
    eyebrow: "HOW KIKU WORKS",
    title: "From a moment to a meal.",
    intro: "Kiku connects a small set of understandable signals into a food-discovery pipeline. The system is designed so that the recommendation engine can be tested, explained, and improved independently of the interface that collects the signals.",
    sections: [
      { heading: "1. Start with context", body: "You can start with a manual mood, an optional expression scan, a craving, a budget, or an ordinary food search. You never need to use every input." },
      { heading: "2. Build a recommendation context", body: "For signed-in users, Kiku can add explicit preferences, saved items, and observed first-party activity. For guests, Kiku uses only the signals supplied in the current session." },
      { heading: "3. Retrieve and rank", body: "Kiku first retrieves candidate dishes, applies hard constraints such as allergies, then scores candidates against the current context. The initial ranking system is deterministic and can provide reasons for its choices." },
      { heading: "4. Order or cook", body: "From a dish, continue to the restaurant experience when available, or open a recipe and cook at home. More ordering options are planned for future versions." },
      { heading: "5. Learn from real actions", body: "When signed in, Kiku can record actions it actually observes—such as saves, searches, recipe opens, and recommendation interactions—and use that first-party history to make future discovery more relevant." },
    ],
  },
};

function publicPath(type: PublicInfoRoute) {
  return type ? `/${type}` : "/";
}

export default function PublicInfoPage({ type, darkMode, setDarkMode, onHome, onNavigate, onManagePrivacy }: { type: Exclude<PublicInfoRoute, null>; darkMode: boolean; setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void; onHome: () => void; onNavigate: (route: Exclude<PublicInfoRoute, null>) => void; onManagePrivacy?: () => void }) {
  const content = useMemo(() => CONTENT[type], [type]);
  const links = ["about", "how-it-works", "support", "privacy", "terms", "accessibility"] as const;
  const linkLabels = { about: "About", "how-it-works": "How it works", support: "Support", privacy: "Privacy Policy", terms: "Terms", accessibility: "Accessibility" };

  return (
    <main className={`kiku-public-page ${darkMode ? "dark-mode" : ""}`}>
      <header className="kiku-public-header">
        <button type="button" className="kiku-public-brand" onClick={onHome} aria-label="Kiku home">
          <img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" />
        </button>
        <nav className="kiku-public-nav" aria-label="Information navigation">
          <button type="button" onClick={onHome}>Kiku</button>
          <button type="button" onClick={() => onNavigate("about")}>About</button>
          <button type="button" onClick={() => onNavigate("how-it-works")}>How it works</button>
          <button type="button" onClick={() => onNavigate("support")}>Support</button>
        </nav>
        <div className="kiku-public-actions">
          <button type="button" className="kiku-public-theme" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}>
            {darkMode ? "☼" : "◐"}
          </button>
          <button type="button" className="kiku-public-home" onClick={onHome}>Back to Kiku <span aria-hidden="true">→</span></button>
        </div>
      </header>

      <div className="kiku-public-shell">
        <div className="kiku-public-hero">
          <button type="button" className="kiku-public-back" onClick={onHome} aria-label="Back to Kiku">←</button>
          <div>
            <span className="eyebrow">{content.eyebrow}</span>
            <h1>{content.title}</h1>
            <p>{content.intro}</p>
            {content.updated && <small>{content.updated}</small>}
          </div>
        </div>

        {content.highlights && (
          <div className="kiku-public-highlights" aria-label="Kiku highlights">
            {content.highlights.map((item) => <span key={item}>{item}</span>)}
          </div>
        )}

        {type === "privacy" && (
          <div className="kiku-public-privacy-action">
            <div>
              <span className="eyebrow">PRIVACY CONTROL</span>
              <h2>Manage or delete your Kiku data</h2>
              <p>Signed-in users can open Mood &amp; Privacy in Profile &amp; Settings to review account data and permanently delete the Kiku account data associated with it.</p>
            </div>
            <button type="button" onClick={onManagePrivacy}>Manage my data <span aria-hidden="true">→</span></button>
          </div>
        )}

        <div className="kiku-public-content">
          <aside className="kiku-public-toc" aria-label="On this page">
            <span className="eyebrow">ON THIS PAGE</span>
            <div>
              {content.sections.map((section, index) => <a key={section.heading} href={`#public-section-${index + 1}`}>{String(index + 1).padStart(2, "0")} {section.heading}</a>)}
            </div>
          </aside>
          <div className="kiku-public-sections">
            {content.sections.map((section, index) => (
              <section className="kiku-public-section" id={`public-section-${index + 1}`} key={section.heading}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{section.heading}</h2>
                  <p>{section.body}</p>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <footer className="kiku-public-footer">
        <div>
          <button type="button" className="kiku-public-footer-brand" onClick={onHome}><img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" /></button>
          <p>Food for every mood. A calmer way to discover what fits the moment.</p>
        </div>
        <nav aria-label="Footer information links">
          {links.map((link) => <a key={link} href={publicPath(link)} onClick={(event) => { event.preventDefault(); onNavigate(link); }}>{linkLabels[link]}</a>)}
        </nav>
        <small>© 2026 Kiku. Good food, thoughtfully found.</small>
      </footer>
    </main>
  );
}
