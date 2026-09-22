import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./index.css";
import ProfilePage from "./pages/profile/Profile";
import LoginPage from "./pages/auth/Login";
import SignupPage from "./pages/auth/Signup";
import ForgotPasswordPage from "./pages/auth/ForgotPassword";
import ResetPasswordPage from "./pages/auth/ResetPassword";
import VerifyEmailPage from "./pages/auth/VerifyEmail";
import PincodeDialog from "./components/location/PincodeDialog";
import PublicInfoPage from "./pages/PublicInfoPage";
import { getKikuPincode, hasDismissedKikuPincodePrompt, dismissKikuPincodePrompt, hydrateKikuPincode, clearKikuPincode } from "./stores/location-store";
import {
  getKikuPreferences,
  getKikuSavedItems,
  toggleKikuSavedDish,
  toggleKikuSavedRecipe,
  toggleKikuSavedRestaurant,
  scoreKikuDish,
  hydrateKikuUserState,
} from "./stores/profile-store";

import { moods, moodQuotes } from "./data/moods";
import { cravingOptions, budgetOptions } from "./data/filters";
import { inferStepIngredients, normalizeRecipe, normalizeRecipeDetails, parseServingCount, scaleIngredientAmount } from "./data/recipes";
import {
  warmUpMoodModel,
  readFaceSignalsFromVideo,
  averageBlendshapes,
  predictMoodFromBlendshapes,
  type FaceSignals,
} from "./data/mood-model";
import { fetchLiveComparison, type LiveComparisonResult } from "./data/priceCompare";
import { api } from "./services/api";
import { workflowStages } from "./data/workflow";
import {
  ThemeIcon,
  PersonIcon,
  SearchIcon,
  HomeIcon,
  AssistantIcon,
  RecipesIcon,
  FlipCameraIcon,
  CameraOffIcon,
} from "./components/icons/ui-icons";
import type { Dish } from "./types";
import { detectPotentialAllergensFromIngredients, matchesDietaryFilter, normalizeDietaryEvidence } from "../shared/dietary.js";
import { scrollToSection, getStandaloneRoute, getPublicInfoRoute, type PublicInfoRoute } from "./utils/navigation";

const navItems = [
  { label: "Home", target: "home", activeKey: "home" },
  { label: "Discover", target: "discover", activeKey: "discover" },
  { label: "Search", target: "discover-search", activeKey: "search" },
  { label: "Mood", target: "mood", activeKey: "mood" },
  { label: "Recipes", target: "recipes", activeKey: "recipes" },
];

const mobileNavItems = [
  { label: "Home", target: "home", Icon: HomeIcon, activeKey: "home" },
  { label: "Search", target: "discover-search", Icon: SearchIcon, activeKey: "search" },
  { label: "Assistant", target: "home", Icon: AssistantIcon, activeKey: null },
  { label: "Recipes", target: "recipes", Icon: RecipesIcon, activeKey: "recipes" },
  { label: "Profile", target: "home", Icon: PersonIcon, activeKey: "profile" },
];

const getAuthReturn = () => {
  try { return sessionStorage.getItem("kiku-auth-return") || "home"; } catch { return "home"; }
};
const setAuthReturn = (value) => {
  try { sessionStorage.setItem("kiku-auth-return", value); } catch {}
};
const clearAuthReturn = () => {
  try { sessionStorage.removeItem("kiku-auth-return"); } catch {}
};

export default function App() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("kiku-theme") === "dark"; } catch { return false; }
  });
  const [activeSection, setActiveSection] = useState("home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [profileRoute, setProfileRoute] = useState(() => (
    typeof window !== "undefined" && (window.location.hash === "#profile" || window.location.hash.startsWith("#profile/"))
  ));
  const [authRoute, setAuthRoute] = useState(() => getStandaloneRoute());
  const [publicInfoRoute, setPublicInfoRoute] = useState<PublicInfoRoute>(() => getPublicInfoRoute());

  useEffect(() => {
    const syncAuthRoute = () => setAuthRoute(getStandaloneRoute());
    window.addEventListener("popstate", syncAuthRoute);
    window.addEventListener("hashchange", syncAuthRoute);
    return () => {
      window.removeEventListener("popstate", syncAuthRoute);
      window.removeEventListener("hashchange", syncAuthRoute);
    };
  }, []);

  useEffect(() => {
    const syncPublicInfoRoute = () => setPublicInfoRoute(getPublicInfoRoute());
    window.addEventListener("popstate", syncPublicInfoRoute);
    window.addEventListener("hashchange", syncPublicInfoRoute);
    syncPublicInfoRoute();
    return () => {
      window.removeEventListener("popstate", syncPublicInfoRoute);
      window.removeEventListener("hashchange", syncPublicInfoRoute);
    };
  }, []);
  const [pincode, setPincode] = useState(() => getKikuPincode());
  const [regionStatus, setRegionStatus] = useState<"idle" | "scraping" | "queued" | "ready" | "stale" | "error">("idle");
  const [regionStatusError, setRegionStatusError] = useState("");
  const [regionDataVersion, setRegionDataVersion] = useState(0);
  const [pincodeOpen, setPincodeOpen] = useState(false);
  const [pincodePromptSeen, setPincodePromptSeen] = useState(() => hasDismissedKikuPincodePrompt());
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantConversationId, setAssistantConversationId] = useState(null);
  const [assistantRecipeContext, setAssistantRecipeContext] = useState(null);
  const [recipeSubstitutionModal, setRecipeSubstitutionModal] = useState(null);
  const [recipeSubstitutionText, setRecipeSubstitutionText] = useState("");
  const [recipeSubstitutionBusy, setRecipeSubstitutionBusy] = useState(false);
  const [recipeSubstitutionError, setRecipeSubstitutionError] = useState("");
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [carouselScrollLeft, setCarouselScrollLeft] = useState(0);
  const [carouselCanScrollRight, setCarouselCanScrollRight] = useState(true);
  const [catalogDishes, setCatalogDishes] = useState([]);
  const [serverRecommendations, setServerRecommendations] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [activeDish, setActiveDish] = useState(null);
  const [liveComparison, setLiveComparison] = useState<LiveComparisonResult | null>(null);
  const [comparisonStatus, setComparisonStatus] = useState<"idle" | "loading" | "live" | "fallback">("idle");
  const comparisonRequestId = useRef(0);
  const [activeRestaurant, setActiveRestaurant] = useState(null);
  const [dishHistory, setDishHistory] = useState([]);
  const [dishReturnRestaurant, setDishReturnRestaurant] = useState(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [allergenSafeOnly, setAllergenSafeOnly] = useState(false);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [discoverFilter, setDiscoverFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");  const [workflowStep, setWorkflowStep] = useState(0);

  const [likedDishes, setLikedDishes] = useState(() => new Set(getKikuSavedItems().dishes.map((item) => item.name)));
  const [likedRestaurants, setLikedRestaurants] = useState(() => new Set(getKikuSavedItems().restaurants.map((item) => item.name)));
  const [similarScrollLeft, setSimilarScrollLeft] = useState(0);
  const [similarCanScrollRight, setSimilarCanScrollRight] = useState(false);
  const [moodStage, setMoodStage] = useState("scan"); // "scan" | "result"
  const [scanStatus, setScanStatus] = useState("idle"); // idle | requesting | scanning | denied
  const [detectedMood, setDetectedMood] = useState(null); // { mood, confidence } — set at runtime only
  const [craving, setCraving] = useState(null);
  const [budget, setBudget] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recipesError, setRecipesError] = useState("");
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [activeCooking, setActiveCooking] = useState(null);
  const [cookingStep, setCookingStep] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [stepCompletePopup, setStepCompletePopup] = useState(false);
  const [recipeServingCount, setRecipeServingCount] = useState(0);
  const [recipeTab, setRecipeTab] = useState("Ingredients");
  const [savedRecipes, setSavedRecipes] = useState(() => new Set(getKikuSavedItems().recipes.map((item) => item.name)));
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const homeRef = useRef(null);
  const discoverRef = useRef(null);
  const dishSearchSectionRef = useRef(null);
  const moodRef = useRef(null);
  const recipesRef = useRef(null);
  const dishSearchInputRef = useRef(null);
  const carouselRef = useRef(null);
  const similarRailRef = useRef(null);
  const workflowStepRefs = useRef([]);
  const moodVideoRef = useRef(null);
  const moodStreamRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const moodSamplesRef = useRef<FaceSignals[]>([]);
  const moodSampleIntervalRef = useRef(null);
  const moodSamplingActiveRef = useRef(false);
  const moodSamplingBusyRef = useRef(false);
  const timerIntervalRef = useRef(null);
  const cookingStepRef = useRef(null);
  const cookingProgressItemRefs = useRef([]);
  const wakeLockRef = useRef<any>(null);
  const timerTargetRef = useRef(0);
  const profileReturnScrollRef = useRef(0);


  useEffect(() => {
    document.documentElement.classList.toggle("kiku-dark", darkMode);
    try { localStorage.setItem("kiku-theme", darkMode ? "dark" : "light"); } catch { /* optional browser preference */ }
  }, [darkMode]);

  useEffect(() => {
    if (!activeCooking) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timerRunning && timerTargetRef.current > 0) {
          setTimerRemaining(Math.max(0, Math.ceil((timerTargetRef.current - Date.now()) / 1000)));
        }
        void requestCookingWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeCooking, timerRunning]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loggedIn = await hydrateKikuUserState();
      await hydrateKikuPincode();
      if (!cancelled) {
        setIsLoggedIn(loggedIn);
        setPincode(getKikuPincode());
        setAuthReady(true);
      }
    })();
    const onAuthChange = (event) => {
      if (typeof event?.detail?.authenticated === "boolean") setIsLoggedIn(event.detail.authenticated);
    };
    window.addEventListener("kiku-auth-change", onAuthChange);
    return () => { cancelled = true; window.removeEventListener("kiku-auth-change", onAuthChange); };
  }, []);

  useEffect(() => {
    const syncStoredKikuData = () => {
      const saved = getKikuSavedItems();
      setLikedDishes(new Set((saved.dishes || []).map((item) => item.name)));
      setSavedRecipes(new Set((saved.recipes || []).map((item) => item.name)));
      setLikedRestaurants(new Set((saved.restaurants || []).map((item) => item.name)));
      setPincode(getKikuPincode());
      setPreferenceVersion((value) => value + 1);
    };
    window.addEventListener("kiku-saved-change", syncStoredKikuData);
    window.addEventListener("kiku-preferences-change", syncStoredKikuData);
    window.addEventListener("kiku-profile-change", syncStoredKikuData);
    syncStoredKikuData();
    return () => {
      window.removeEventListener("kiku-saved-change", syncStoredKikuData);
      window.removeEventListener("kiku-preferences-change", syncStoredKikuData);
      window.removeEventListener("kiku-profile-change", syncStoredKikuData);
    };
  }, []);

  useEffect(() => {
    const syncProfileRoute = () => {
      const next = window.location.hash === "#profile" || window.location.hash.startsWith("#profile/");
      setProfileRoute(next);
      if (next) window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("hashchange", syncProfileRoute);
    syncProfileRoute();
    return () => window.removeEventListener("hashchange", syncProfileRoute);
  }, []);

  useEffect(() => {
    const syncStandaloneRoute = () => {
      const route = getStandaloneRoute();
      setAuthRoute(route);
      if (route) window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", syncStandaloneRoute);
    window.addEventListener("popstate", syncStandaloneRoute);
    syncStandaloneRoute();
    return () => {
      window.removeEventListener("hashchange", syncStandaloneRoute);
      window.removeEventListener("popstate", syncStandaloneRoute);
    };
  }, []);

  useEffect(() => {
    const syncPin = (event) => setPincode(event.detail || getKikuPincode());
    const markSeen = () => setPincodePromptSeen(true);
    window.addEventListener("kiku-pincode-change", syncPin);
    window.addEventListener("kiku-pincode-prompt-dismissed", markSeen);
    return () => {
      window.removeEventListener("kiku-pincode-change", syncPin);
      window.removeEventListener("kiku-pincode-prompt-dismissed", markSeen);
    };
  }, []);

  useEffect(() => {
    const normalized = String(pincode || "").trim();
    if (!/^[1-9]\d{5}$/.test(normalized)) {
      setRegionStatus("idle");
      setRegionStatusError("");
      return undefined;
    }

    let cancelled = false;
    let timer: number | null = null;
    let elapsed = 0;
    let completionPublished = false;

    const stopPolling = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };

    const publish = (status: any) => {
      if (cancelled) return;
      setRegionStatus(status.status || "idle");
      setRegionStatusError(status.error || "");
      if ((status.status === "ready" || status.status === "stale") && !completionPublished) {
        completionPublished = true;
        stopPolling();
        setRegionDataVersion((value) => value + 1);
      }
      if (status.status === "error") stopPolling();
    };

    const poll = async () => {
      if (cancelled) return;
      elapsed += 1000;
      try {
        const status = await api.regionStatus(normalized);
        publish(status);
        if (elapsed >= 45_000 && status.status !== "ready" && status.status !== "stale") {
          stopPolling();
          if (!cancelled) {
            setRegionStatus("error");
            setRegionStatusError("Regional lookup is taking longer than expected. Kiku is keeping this PIN isolated from other users.");
          }
        }
      } catch (error) {
        if (!cancelled && elapsed >= 45_000) {
          stopPolling();
          setRegionStatus("error");
          setRegionStatusError(error instanceof Error ? error.message : "Regional lookup failed.");
        }
      }
    };

    const start = async () => {
      setRegionStatus("scraping");
      setRegionStatusError("");
      try {
        const started = await api.regionRefresh(normalized);
        if (cancelled) return;
        publish(started);
        if (!["ready", "stale"].includes(started.status)) {
          timer = window.setInterval(() => { void poll(); }, 1000);
          void poll();
        }
      } catch (error) {
        if (!cancelled) {
          setRegionStatus("error");
          setRegionStatusError(error instanceof Error ? error.message : "Regional lookup failed.");
        }
      }
    };

    void start();
    return () => { cancelled = true; stopPolling(); };
  }, [pincode]);

  useEffect(() => {
    const isMainRoute = !profileRoute && !authRoute;
    if (isMainRoute && !isLoggedIn && !pincode && !pincodePromptSeen) {
      const timer = window.setTimeout(() => setPincodeOpen(true), 650);
      return () => window.clearTimeout(timer);
    }
  }, [authRoute, isLoggedIn, pincode, pincodePromptSeen, profileRoute]);

  useEffect(() => {
    const updateActiveSectionFromScroll = () => {
      // The desktop header follows the page sections, regardless of the
      // current URL. This keeps the workflow under Search and prevents a
      // /recipes/... pathname from pinning the header to Recipes while the
      // user is still at the top of the app.
      const header = document.querySelector(".navbar");
      const headerHeight = header?.getBoundingClientRect().height ?? 110;
      const anchor = window.scrollY + headerHeight + 12;
      const getTop = (ref) => {
        const element = ref.current;
        if (!element) return Number.POSITIVE_INFINITY;
        return element.getBoundingClientRect().top + window.scrollY;
      };

      const discoverTop = getTop(discoverRef);
      const searchTop = getTop(dishSearchSectionRef);
      const moodTop = getTop(moodRef);
      const recipesTop = getTop(recipesRef);

      if (anchor >= recipesTop) {
        setActiveSection("recipes");
      } else if (anchor >= moodTop) {
        setActiveSection("mood");
      } else if (anchor >= searchTop) {
        // Search owns the complete dish-search + workflow sequence.
        setActiveSection("search");
      } else if (anchor >= discoverTop) {
        setActiveSection("discover");
      } else {
        setActiveSection("home");
      }
    };

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActiveSectionFromScroll);
    };

    updateActiveSectionFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("popstate", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("popstate", onScroll);
    };
  }, []);

  const discoveryDishes = catalogDishes;

  const getAssistantExternalUrl = (item) => {
    const candidates = [
      item?.listingUrl, item?.listing_url, item?.orderUrl, item?.order_url, item?.sourceUrl, item?.source_url,
      Array.isArray(item?.orderLinks) ? item.orderLinks[0]?.url || item.orderLinks[0]?.href : null,
    ];
    for (const value of candidates) {
      try {
        const url = new URL(String(value || ""), window.location.origin);
        if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname !== window.location.hostname) return url.toString();
      } catch { /* ignore invalid/untrusted provider URLs */ }
    }
    return null;
  };

  const getAssistantRecipeUrl = (recipe) => {
    try {
      const url = new URL(String(recipe?.url || recipe?.sourceUrl || recipe?.details?.sourceUrl || ""), window.location.origin);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  };

  const normalizeCatalogDish = (item) => ({
    ...item,
    price: item?.price || "—",
    time: item?.time || "",
    rating: item?.rating || "—",
    tags: Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag)).filter(Boolean) : [],
    art: item?.art || "🍽️",
    artClass: item?.artClass || "dish-art-rose",
    restaurantMeta: item?.restaurantMeta || item?.restaurant || "",
    ...normalizeDietaryEvidence(item),
    orderOnlineAvailable: item?.orderOnlineAvailable === true || Boolean(item?.orderUrl || item?.order_url || (Array.isArray(item?.orderLinks) && item.orderLinks.length)),
    cookAtHomeAvailable: item?.cookAtHomeAvailable === true || item?.recipeAvailable === true || item?.tags?.some?.((tag) => /^(cook at home|recipe)$/i.test(tag)),
    recipeAvailable: item?.recipeAvailable === true,
  });

  useEffect(() => {
    if (!isLoggedIn) {
      setAssistantConversationId(null);
      setAssistantMessages([]);
      return undefined;
    }
    let cancelled = false;
    api.assistantConversations().then(async (result) => {
      const latest = result.conversations?.[0];
      if (!latest || cancelled) return;
      setAssistantConversationId(latest.id);
      try {
        const history = await api.assistantMessages(latest.id);
        if (!cancelled) setAssistantMessages((history.messages || []).map((message) => ({ role: message.role, content: message.content, data: message.data })));
      } catch {
        if (!cancelled) setAssistantMessages([]);
      }
    }).catch(() => { if (!cancelled) { setAssistantConversationId(null); setAssistantMessages([]); } });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    let cancelled = false;
    const preferences = getKikuPreferences();
    api.discover("", { pincode, dietary: preferences.dietary, allergies: preferences.allergies }).then((result) => {
      if (!cancelled) setCatalogDishes((result.dishes || []).map(normalizeCatalogDish));
    }).catch(() => { /* Keep the production UI empty when the catalog API is unavailable. */ });
    return () => { cancelled = true; };
  }, [preferenceVersion, regionDataVersion, pincode]);

  useEffect(() => {
    if (!selectedMood) { setServerRecommendations([]); return undefined; }
    let cancelled = false;
    const preferences = getKikuPreferences();
    api.recommendations({
      expressionSignal: detectedMood?.mood ? { label: detectedMood.mood, confidence: Math.max(0, Math.min(1, (detectedMood.confidence || 0) / 100)) } : null,
      manualMood: selectedMood,
      craving,
      dietary: preferences.dietary,
      allergies: preferences.allergies,
      cuisines: preferences.cuisines,
      spiceLevel: preferences.spiceLevel,
      budget: budget
        ? { min: preferences.budgetMin ?? null, max: Number(String(budget).replace(/[^0-9.]/g, "")) || preferences.budgetMax || null }
        : { min: preferences.budgetMin ?? null, max: preferences.budgetMax ?? null },
      pincode,
      limit: 6,
    }).then((result) => {
      if (!cancelled) setServerRecommendations(result.recommendations || []);
    }).catch(() => { if (!cancelled) setServerRecommendations([]); });
    return () => { cancelled = true; };
  }, [selectedMood, detectedMood, craving, budget, preferenceVersion, pincode, regionDataVersion]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const preferences = getKikuPreferences();
      api.search(q, { pincode, dietary: preferences.dietary, allergies: preferences.allergies }).then((result) => {
        if (!cancelled) setSearchResults((result.dishes || []).map(normalizeCatalogDish));
      }).catch(() => { if (!cancelled) setSearchResults([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, preferenceVersion, pincode, regionDataVersion]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;

    const loadRecipes = async () => {
      if (cancelled || loading) return;
      loading = true;
      setRecipesLoading(true);
      setRecipesError("");
      try {
        const payload = await api.recipes(recipeQuery.trim());
        const normalized = (payload.recipes || []).map(normalizeRecipe).filter((recipe) => recipe.title && recipe.title !== "Untitled recipe");
        if (!cancelled) {
          setRecipes(normalized);
          setRecipesLoading(false);
          if (!normalized.length && payload.error) setRecipesError("The live recipe feed did not return any matching recipes.");
        }
      } catch {
        if (!cancelled) {
          setRecipes([]);
          setRecipesLoading(false);
          setRecipesError("The live recipe feed is temporarily unavailable. Please try again shortly.");
        }
      } finally {
        loading = false;
      }
    };

    const timer = window.setTimeout(loadRecipes, recipeQuery.trim() ? 320 : 0);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") loadRecipes(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [recipeQuery]);

  const visibleRecipes = useMemo(() => {
    const query = recipeQuery.trim().toLowerCase();
    const preferences = getKikuPreferences();
    const matchesPreferences = (recipe) => {
      const tags = recipe.tags || [];
      const pseudoDish = {
        name: recipe.title,
        restaurant: recipe.cuisine || "",
        descriptor: recipe.description || "",
        tags,
      };
      return scoreKikuDish(pseudoDish, preferences).allowed;
    };
    const filtered = recipes.filter(matchesPreferences);

    if (!query) return filtered.slice(0, 6);

    return filtered
      .filter((recipe) =>
        [recipe.title, recipe.description, recipe.cuisine, ...(recipe.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 6);
  }, [recipes, recipeQuery, preferenceVersion]);

  const hasRecommendationData = Boolean(selectedMood);

  const visibleDishes = useMemo(() => {
    const preferences = getKikuPreferences();
    const matchesDiscoverFilter = (dish) => {
      const tags = new Set((dish.tags || []).map((tag) => String(tag).trim().toLowerCase()));
      if (discoverFilter === "All") return true;
      if (discoverFilter === "Order Online") return dish.orderOnlineAvailable === true;
      if (discoverFilter === "Cook at Home") return dish.cookAtHomeAvailable === true;
      if (discoverFilter === "Healthy") return tags.has("healthy");
      if (discoverFilter === "Quick") return tags.has("quick") || /^(?:[0-2]?\d|30)\s*min$/i.test(String(dish.time || ""));
      return true;
    };
    const scoreList = (dishes) => dishes
      .map((dish, index) => {
        const preference = scoreKikuDish(dish, preferences);
        return { dish, allowed: preference.allowed && matchesDiscoverFilter(dish), score: preference.score - index * 0.001 };
      })
      .filter((entry) => entry.allowed)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.dish);

    if (hasRecommendationData && serverRecommendations.length) {
      return serverRecommendations.map((entry) => normalizeCatalogDish(entry.dish)).filter(matchesDiscoverFilter).slice(0, 6);
    }
    if (!hasRecommendationData) {
      if (!discoveryDishes.length) return [];
      const offset = shuffleSeed % discoveryDishes.length;
      const rotated = [...discoveryDishes.slice(offset), ...discoveryDishes.slice(0, offset)];
      return scoreList(rotated).slice(0, 6);
    }
    return [];
  }, [catalogDishes, hasRecommendationData, selectedMood, shuffleSeed, preferenceVersion, serverRecommendations, discoverFilter]);

  const discoverTitle = hasRecommendationData ? "Recommendations" : "Discover";
  const discoverHeadline = hasRecommendationData ? "Made for this moment" : "Find something that feels right";
  const discoverDescription = hasRecommendationData
    ? `Based on your ${selectedMood.toLowerCase()} moment and the choices you've made in Kiku.`
    : "Explore a few ideas, save what catches your eye, and let Kiku learn what fits you over time.";

  useEffect(() => {
    const section = document.getElementById("how-kiku-works");

    const updateWorkflowStep = () => {
      if (!section) return;

      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const scrollRange = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(
        1,
        Math.max(0, (window.scrollY - sectionTop) / scrollRange)
      );

      // Five equal scroll bands. The final stage stays active until the
      // workflow section itself ends and the page is allowed to continue.
      const nextStep = Math.min(
        workflowStages.length - 1,
        Math.floor(progress * workflowStages.length)
      );

      setWorkflowStep(nextStep);
    };

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateWorkflowStep);
    };

    updateWorkflowStep();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const scrollToWorkflowStep = (index) => {
    const section = document.getElementById("how-kiku-works");
    if (!section) return;

    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const scrollRange = Math.max(1, section.offsetHeight - window.innerHeight);
    const progress = index / Math.max(1, workflowStages.length - 1);

    window.scrollTo({
      top: sectionTop + scrollRange * progress,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!activeDish && !activeRestaurant && !activeRecipe && !activeCooking) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (activeCooking) {
        setActiveCooking(null);
        setTimerRunning(false);
        return;
      }
      if (activeRecipe) {
        setActiveRecipe(null);
        return;
      }
      if (activeDish) setActiveDish(null);
      else setActiveRestaurant(null);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeDish, activeRestaurant, activeRecipe, activeCooking]);

  // Stop the cooking timer if the component unmounts mid-timer.
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Keep the active step centered in the horizontally-scrollable step
  // counter whenever the step changes (via Next/Previous, tapping a step,
  // or opening a fresh cooking session) — covers steps that don't all fit
  // on screen without needing the person to scroll it manually first.
  useEffect(() => {
    if (!activeCooking) return;
    cookingProgressItemRefs.current[cookingStep]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeCooking, cookingStep]);

  // Shared by openDish and goBackFromDish so both paths keep the live
  // comparison in sync with whatever dish is actually on screen. A
  // requestId guard discards any response that arrives after the person
  // has since navigated to a different dish (or closed the modal).
  const refreshLiveComparison = (dish: Dish) => {
    setLiveComparison(null);
    setComparisonStatus("loading");
    const requestId = comparisonRequestId.current + 1;
    comparisonRequestId.current = requestId;
    const preferences = getKikuPreferences();
    fetchLiveComparison(dish.restaurant, dish.name, pincode, { dietary: preferences.dietary, allergies: preferences.allergies }).then((result) => {
      if (comparisonRequestId.current !== requestId) return; // stale response
      setLiveComparison(result);
      setComparisonStatus(result ? "live" : "fallback");
    });
  };

  const openDish = (dish: Dish, options: { fromRestaurant?: unknown; pushHistory?: boolean } = {}) => {
    const { fromRestaurant = null, pushHistory = true } = options;
    setDishHistory((history) => {
      if (!activeDish || !pushHistory) return history;
      return [...history, activeDish].slice(-8);
    });
    if (fromRestaurant) setDishReturnRestaurant(fromRestaurant);
    setActiveRestaurant(null);
    setActiveDish(dish);
    if (isLoggedIn) {
      void api.activity({
        type: "view_dish",
        entityType: "dish",
        entityId: dish.name,
        metadata: { restaurant: dish.restaurant, cuisine: dish.restaurantMeta?.split(" • ")[0] || null, price: Number(String(dish.price || "").replace(/[^0-9.]/g, "")) || null },
      }).catch(() => {});
    }

    // Live comparison fetches only menu prices; location is used as a
    // discovery hint and never as a delivery/ETA calculation.
    // comparison data, not a replacement for it - the modal already has
    // something reasonable to show immediately, and only swaps to live
    // numbers if/when they arrive.
    refreshLiveComparison(dish);
  };

  const openRestaurant = (restaurant) => {
    setDishHistory([]);
    setDishReturnRestaurant(null);
    setActiveDish(null);
    setVegOnly(false);
    setAllergenSafeOnly(false);
    setRestaurantSearch("");
    setActiveRestaurant(restaurant);
    if (isLoggedIn) {
      void api.activity({
        type: "view_restaurant",
        entityType: "restaurant",
        entityId: restaurant.name,
        metadata: { cuisine: restaurant.cuisine || null },
      }).catch(() => {});
    }
  };

  const closeDish = () => {
    setDishHistory([]);
    setDishReturnRestaurant(null);
    setActiveDish(null);
  };

  const goBackFromDish = () => {
    setDishHistory((history) => {
      if (history.length > 0) {
        const previousDish = history[history.length - 1];
        setActiveDish(previousDish);
        refreshLiveComparison(previousDish);
        return history.slice(0, -1);
      }

      if (dishReturnRestaurant) {
        setActiveDish(null);
        setActiveRestaurant(dishReturnRestaurant);
        setDishReturnRestaurant(null);
      } else {
        setActiveDish(null);
      }
      return [];
    });
  };

  // Covers every way the dish modal can close (Escape key, back
  // navigation, logout, etc.) in one place, rather than remembering to
  // reset comparison state at each individual call site that nulls
  // activeDish. Also invalidates any in-flight fetch so a slow response
  // can't call setState after the person has moved on.
  useEffect(() => {
    if (activeDish) return;
    comparisonRequestId.current += 1;
    setLiveComparison(null);
    setComparisonStatus("idle");
  }, [activeDish]);

  const focusDishSearch = () => {
    setActiveSection("search");
    document.getElementById("discover-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => dishSearchInputRef.current?.focus(), 420);
  };

  const buildRecipeContext = (recipeState) => {
    if (!recipeState?.recipe) return null;
    const recipe = recipeState.recipe;
    return {
      id: recipeState.recipeId || recipe.id || null,
      title: recipeState.dish?.name || recipe.title || "Recipe",
      cuisine: recipe.cuisine || "",
      servings: recipe.servings || "",
      prepTime: recipe.prepTime || null,
      cookTime: recipe.cookTime || null,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? null,
      totalTimeMinutes: recipe.totalTimeMinutes ?? null,
      difficulty: recipe.difficulty || null,
      rating: recipe.rating || "",
      description: recipe.description || "",
      image: recipe.image || null,
      source: recipe.source || null,
      provenance: recipe.provenance || null,
      nutrition: recipe.nutrition || null,
      substitutions: recipe.substitutions || [],
      ingredients: (recipe.ingredients || []).slice(0, 40),
      steps: (recipe.steps || []).slice(0, 24).map((step) => ({
        name: step.name, instruction: step.instruction, duration: step.duration || 0, tip: step.tip || "", ingredients: step.ingredients || [], heat: step.heat || null, cue: step.cue || null,
      })),
      equipment: recipe.equipment || [],
      sourceUrl: recipe.sourceUrl || null,
    };
  };

  const openAssistant = (recipeState = null) => {
    const context = recipeState || (activeCooking ? { recipe: activeCooking.recipe, recipeId: activeCooking.recipeId, dish: activeCooking.dish } : activeRecipe);
    setAssistantRecipeContext(buildRecipeContext(context));
    setAssistantOpen(true);
  };

  const closeAssistant = () => {
    setAssistantOpen(false);
    setAssistantQuery("");
    setAssistantRecipeContext(null);
  };

  const applyRecipeVariant = (variant) => {
    if (!variant?.ingredients || !variant?.steps) return;
    if (activeCooking) {
      setActiveCooking((current) => current ? { ...current, recipe: { ...current.recipe, ...variant } } : current);
      const step = Math.min(cookingStep, Math.max(0, variant.steps.length - 1));
      setCookingStep(step);
      setTimerRemaining(variant.steps[step]?.duration || 0);
      setTimerRunning(false);
    } else if (activeRecipe) {
      setActiveRecipe((current) => current ? { ...current, recipe: { ...current.recipe, ...variant } } : current);
      setRecipeServingCount(parseServingCount(variant.servings, 0));
    }
    setAssistantRecipeContext((current) => current ? { ...current, ingredients: variant.ingredients, steps: variant.steps, equipment: variant.equipment || current.equipment } : current);
  };

  const openSubstitutionModal = (ingredient, recipeState = activeRecipe) => {
    if (!recipeState?.recipe) return;
    setRecipeSubstitutionModal({ ingredient, recipeState });
    setRecipeSubstitutionText("");
    setRecipeSubstitutionError("");
  };

  const submitRecipeSubstitution = async (event) => {
    event.preventDefault();
    const substitute = recipeSubstitutionText.trim();
    const ingredient = recipeSubstitutionModal?.ingredient?.trim();
    if (!substitute || !ingredient || recipeSubstitutionBusy || !recipeSubstitutionModal?.recipeState) return;
    setRecipeSubstitutionBusy(true);
    setRecipeSubstitutionError("");
    try {
      const recipeState = recipeSubstitutionModal.recipeState;
      const result = await api.substituteRecipe({
        recipe: buildRecipeContext(recipeState),
        ingredient,
        substitute,
      });
      if (result?.recipeVariant) {
        applyRecipeVariant(result.recipeVariant);
      } else {
        setRecipeSubstitutionError("Kiku could not prepare that substitution.");
      }
      setRecipeSubstitutionModal(null);
    } catch (error) {
      setRecipeSubstitutionError(error?.message || "Kiku could not prepare that substitution.");
    } finally {
      setRecipeSubstitutionBusy(false);
    }
  };

  const submitAssistant = async (event) => {
    event.preventDefault();
    const message = assistantQuery.trim();
    if (!message || assistantBusy) return;
    setAssistantMessages((current) => [...current, { role: "user", content: message }]);
    setAssistantQuery("");
    if (!isLoggedIn) {
      const suggestions = assistantMatches.slice(0, 3);
      const content = suggestions.length
        ? `Based on this craving, I’d start with ${suggestions.map((dish) => dish.name).join(", ")}. Sign in to make Kiku use your saved preferences and history.`
        : "Tell me a dish, cuisine, craving, or budget and I’ll suggest something. Sign in to make Kiku use your saved preferences and history.";
      setAssistantMessages((current) => [...current, { role: "assistant", content }]);
      return;
    }
    setAssistantBusy(true);
    try {
      const result = await api.assistant({ message, conversationId: assistantConversationId, recipeContext: assistantRecipeContext });
      setAssistantConversationId(result.conversationId);
      setAssistantMessages((current) => [...current, { role: "assistant", content: result.message, data: result.data }]);
    } catch (error) {
      setAssistantMessages((current) => [...current, { role: "assistant", content: error?.message || "Kiku could not respond right now." }]);
    } finally {
      setAssistantBusy(false);
    }
  };

  const assistantMatches = useMemo(() => {
    const query = assistantQuery.trim().toLowerCase();
    const preferences = getKikuPreferences();
    const terms = query.split(/\s+/).filter(Boolean);
    const pool = discoveryDishes
      .map((dish) => ({ dish, preference: scoreKikuDish(dish, preferences) }))
      .filter((entry) => entry.preference.allowed);

    if (!query) {
      return pool
        .sort((a, b) => b.preference.score - a.preference.score)
        .map((entry) => entry.dish)
        .slice(0, 3);
    }

    return pool
      .map(({ dish, preference }) => {
        const haystack = [dish.name, dish.restaurant, dish.descriptor, ...(dish.tags || [])].join(" ").toLowerCase();
        const matchScore = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { dish, score: matchScore * 10 + preference.score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.dish)
      .slice(0, 3);
  }, [assistantQuery, catalogDishes, preferenceVersion, selectedMood]);

  const navigatePublicInfo = (route: Exclude<PublicInfoRoute, null>) => {
    window.history.pushState({}, "", `/${route}`);
    setPublicInfoRoute(route);
    setAuthRoute(null);
    setProfileRoute(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handlePublicHome = () => {
    window.history.pushState({}, "", "/");
    setPublicInfoRoute(null);
    setAuthRoute(null);
    setProfileRoute(false);
    window.location.hash = "";
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openPrivacyControls = () => {
    if (isLoggedIn) {
      window.history.pushState({}, "", "/");
      window.location.hash = "profile/privacy";
      setPublicInfoRoute(null);
      setProfileRoute(true);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    navigateAuth("login", "profile/privacy");
  };

  const handleAccountDeleted = () => {
    clearKikuPincode();
    setIsLoggedIn(false);
    setAssistantConversationId(null);
    setAssistantMessages([]);
    setServerRecommendations([]);
    setLikedDishes(new Set());
    setLikedRestaurants(new Set());
    setSavedRecipes(new Set());
    setPincode("");
    setProfileRoute(false);
    setPublicInfoRoute(null);
    window.history.replaceState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "auto" });
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: false } }));
  };

  const navigateAuth = (route, returnTo = "home") => {
    setAuthReturn(returnTo);
    if (window.location.pathname !== `/${route}`) {
      window.history.pushState({}, "", `/${route}`);
    } else {
      window.history.replaceState({}, "", `/${route}`);
    }
    setAuthRoute(route);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setProfileRoute(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleSignIn = (returnTo = "home") => {
    if (isLoggedIn) {
      openProfile();
      return;
    }
    navigateAuth("login", returnTo);
  };

  const handleAuthSuccess = async () => {
    await hydrateKikuUserState();
    await hydrateKikuPincode();
    setPincode(getKikuPincode());
    setIsLoggedIn(true);
    setAuthRoute(null);
    const returnTo = getAuthReturn();
    clearAuthReturn();
    window.history.replaceState(null, "", window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/signup") ? "/" : window.location.pathname);
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true } }));
    if (returnTo === "profile" || returnTo.startsWith("profile/")) {
      const profileTarget = returnTo === "profile" ? "profile" : returnTo;
      window.location.hash = profileTarget;
      setProfileRoute(true);
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.hash = "";
      requestAnimationFrame(() => window.scrollTo({ top: profileReturnScrollRef.current || 0, behavior: "auto" }));
    }
  };

  const handleSkipAuth = () => {
    clearAuthReturn();
    setAuthRoute(null);
    window.history.replaceState(null, "", "/");
    window.location.hash = "";
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openProfile = () => {
    profileReturnScrollRef.current = window.scrollY;
    setProfileRoute(true);
    window.location.hash = "profile";
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const closeProfile = () => {
    setProfileRoute(false);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    requestAnimationFrame(() => window.scrollTo({ top: profileReturnScrollRef.current, behavior: "auto" }));
  };

  const handleProfileSignOut = async () => {
    try { await api.logout(); } catch { /* server may already have expired the session */ }
    await hydrateKikuUserState();
    setIsLoggedIn(false);
    closeProfile();
  };

  const openRecipe = async (dish, recipeOverride = null, feedItem = null) => {
    setRecipesError("");
    let details = recipeOverride?.details || recipeOverride || feedItem?.details || null;
    let recipeItem = feedItem || recipeOverride || null;

    try {
      if (!details || !Array.isArray(details.steps) || !details.steps.length || !Array.isArray(details.ingredients) || !details.ingredients.length) {
        if (recipeItem?.id) {
          const result = await api.recipe(String(recipeItem.id));
          recipeItem = result.recipe || recipeItem;
          details = recipeItem?.details || null;
        } else {
          const result = await api.recipes(dish.name);
          const match = (result.recipes || []).find((item) => String(item.title || "").trim().toLowerCase() === dish.name.trim().toLowerCase()) || result.recipes?.[0];
          if (match?.id) {
            recipeItem = match;
            const detailResult = await api.recipe(String(match.id));
            details = detailResult.recipe?.details || null;
            recipeItem = detailResult.recipe || match;
          }
        }
      }
    } catch {
      details = null;
    }

    if (!details || !Array.isArray(details.steps) || !details.steps.length) {
      setRecipesError(`Kiku could not find a complete recipe for ${dish.name}. Try another recipe or search again.`);
      setActiveSection("recipes");
      window.requestAnimationFrame(() => document.getElementById("recipes-grid")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

    const recipe = normalizeRecipeDetails(details, {
      title: dish.name,
      cuisine: recipeItem?.cuisine || dish.restaurantMeta || dish.restaurant,
      image: recipeItem?.image || feedItem?.image || null,
      url: recipeItem?.url || null,
      time: recipeItem?.time || "",
      description: recipeItem?.description || dish.descriptor || "",
    });

    setActiveSection("recipes");
    setActiveDish(null);
    setActiveRestaurant(null);
    setActiveCooking(null);
    setActiveRecipe({ dish, recipe, recipeId: recipeItem?.id ? String(recipeItem.id) : recipe.id || null });
    setRecipeTab("Ingredients");
    setCookingStep(0);
    setTimerRemaining(recipe.steps[0]?.duration || 0);
    setTimerRunning(false);
    setStepCompletePopup(false);
    setRecipeServingCount(parseServingCount(recipe.servings, 0));
    setAssistantRecipeContext(null);
    if (isLoggedIn) {
      void api.activity({
        type: "recipe_open",
        entityType: "recipe",
        entityId: recipeItem?.id ? String(recipeItem.id) : dish.name,
        metadata: { title: dish.name, cuisine: recipe.cuisine || dish.restaurant || null },
      }).catch(() => {});
    }
  };

  const openRecipeFromFeed = async (recipe) => {
    const dish = {
      name: recipe.title,
      descriptor: recipe.description || recipe.title,
      restaurant: recipe.cuisine || "Recipe provider",
      restaurantMeta: recipe.cuisine || "Recipe provider",
      rating: "—",
      time: recipe.time || "",
      price: "",
      tags: recipe.tags || [],
      art: "✿",
      artClass: "",
    };
    await openRecipe(dish, recipe.details || null, recipe);
  };

  const closeRecipe = () => {
    setActiveRecipe(null);
    setTimerRunning(false);
    setActiveSection("recipes");
  };

  const requestCookingWakeLock = async () => {
    try {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      wakeLockRef.current?.addEventListener?.("release", () => { wakeLockRef.current = null; });
    } catch {
      // Wake Lock is an enhancement; cooking remains fully usable without it.
    }
  };

  const releaseCookingWakeLock = async () => {
    try {
      await wakeLockRef.current?.release?.();
    } catch {
      // Ignore browser-level release failures.
    }
    wakeLockRef.current = null;
  };

  const startCooking = (requestedStep = 0) => {
    if (!activeRecipe) return;
    const recipe = activeRecipe.recipe;
    const firstStep = Math.max(0, Math.min(requestedStep, recipe.steps.length - 1));
    clearInterval(timerIntervalRef.current);
    setActiveCooking({
      dish: activeRecipe.dish,
      recipeId: activeRecipe.recipeId || recipe.id || null,
      recipe,
      servingCount: recipeServingCount,
      baseServings: parseServingCount(recipe.servings, 0),
      returnRecipe: activeRecipe,
      returnDish: activeRecipe.dish,
    });
    setActiveRecipe(null);
    setCookingStep(firstStep);
    setTimerRemaining(recipe.steps[firstStep]?.duration || 0);
    setTimerRunning(false);
    setStepCompletePopup(false);
    void requestCookingWakeLock();
  };

  const closeCooking = () => {
    clearInterval(timerIntervalRef.current);
    timerTargetRef.current = 0;
    setTimerRunning(false);
    setStepCompletePopup(false);
    setActiveCooking(null);
    void releaseCookingWakeLock();
  };

  const backToRecipeFromCooking = () => {
    if (!activeCooking?.returnRecipe) {
      closeCooking();
      return;
    }

    clearInterval(timerIntervalRef.current);
    setTimerRunning(false);
    setStepCompletePopup(false);
    setActiveCooking(null);
    setActiveRecipe(activeCooking.returnRecipe);
  };

  const goToCookingStep = (index) => {
    if (!activeCooking) return;
    const nextIndex = Math.max(0, Math.min(index, activeCooking.recipe.steps.length - 1));
    clearInterval(timerIntervalRef.current);
    setStepCompletePopup(false);
    setTimerRunning(false);
    timerTargetRef.current = 0;
    setCookingStep(nextIndex);
    setTimerRemaining(activeCooking.recipe.steps[nextIndex]?.duration || 0);
    requestAnimationFrame(() => {
      cookingStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const nextCookingStep = () => {
    if (!activeCooking) return;
    if (cookingStep >= activeCooking.recipe.steps.length - 1) {
      if (isLoggedIn) {
        void api.activity({ type: "recipe_complete", entityType: "recipe", entityId: activeCooking.dish?.name || null, metadata: { title: activeCooking.dish?.name || null } }).catch(() => {});
      }
      closeCooking();
      return;
    }
    goToCookingStep(cookingStep + 1);
  };

  const previousCookingStep = () => {
    goToCookingStep(cookingStep - 1);
  };

  const toggleRecipeSaved = (dishName) => {
    const recipe = activeRecipe?.recipe?.title === dishName ? activeRecipe.recipe : null;
    const savedRecipe = {
      name: dishName,
      description: recipe?.description || "Kiku recipe",
      time: recipe?.time || "",
      cuisine: recipe?.cuisine || "",
      rating: recipe?.rating || "Not provided by source",
    };
    toggleKikuSavedRecipe(savedRecipe);
    setSavedRecipes(new Set(getKikuSavedItems().recipes.map((item) => item.name)));
  };

  const adjustServings = (delta) => {
    setRecipeServingCount((current) => Math.min(12, Math.max(1, current + delta)));
  };

  const scaledRecipeAmount = (amount, recipe = activeRecipe?.recipe, servingCount = recipeServingCount) => {
    if (!recipe) return amount;
    return scaleIngredientAmount(amount, parseServingCount(recipe.servings, 0), servingCount);
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.max(0, seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const getCookingIngredientNames = (step) => {
    if (!activeCooking || !step) return [];
    const explicit = Array.isArray(step.ingredients) ? step.ingredients.filter(Boolean) : [];
    return explicit.length ? explicit : inferStepIngredients(step.instruction || "", activeCooking.recipe.ingredients || []);
  };

  const getCookingIngredientState = () => {
    if (!activeCooking) return [];
    const ingredients = activeCooking.recipe.ingredients || [];
    const currentStep = activeCooking.recipe.steps[cookingStep];
    const currentStepIngredients = new Set(getCookingIngredientNames(currentStep));
    const directMatches = ingredients
      .filter(([name]) => currentStepIngredients.has(name))
      .map(([name, amount]) => ({
        name,
        amount: activeCooking.baseServings > 0 && activeCooking.servingCount > 0
          ? scaleIngredientAmount(amount, activeCooking.baseServings, activeCooking.servingCount)
          : amount,
      }));
    if (directMatches.length > 0 || !currentStep) return directMatches;

    const instruction = String(currentStep.instruction || "");
    if (/\bbatter\b/i.test(instruction)) return [{ name: "Prepared batter", amount: "From previous step" }];
    if (/\bdough\b/i.test(instruction)) return [{ name: "Prepared dough", amount: "From previous step" }];
    if (/\bsauce\b/i.test(instruction)) return [{ name: "Prepared sauce", amount: "From previous step" }];
    if (/\bmixture\b/i.test(instruction)) return [{ name: "Prepared mixture", amount: "From previous step" }];
    return [];
  };

  const getCookingRemainingIngredients = () => {
    if (!activeCooking) return [];
    const ingredients = activeCooking.recipe.ingredients || [];
    const used = new Set();
    activeCooking.recipe.steps.slice(0, cookingStep + 1).forEach((step) => {
      getCookingIngredientNames(step).forEach((ingredient) => used.add(ingredient));
    });
    return ingredients
      .filter(([name]) => !used.has(name))
      .map(([name, amount]) => ({
        name,
        amount: activeCooking.baseServings > 0 && activeCooking.servingCount > 0
        ? scaleIngredientAmount(amount, activeCooking.baseServings, activeCooking.servingCount)
        : amount,
      }));
  };

  const toggleCurrentTimer = () => {
    if (!activeCooking) return;
    const duration = activeCooking.recipe.steps[cookingStep]?.duration || 0;
    if (!duration) return;

    if (timerRunning) {
      clearInterval(timerIntervalRef.current);
      timerTargetRef.current = 0;
      setTimerRunning(false);
      return;
    }

    const startingSeconds = timerRemaining || duration;
    timerTargetRef.current = Date.now() + startingSeconds * 1000;
    setTimerRunning(true);
    clearInterval(timerIntervalRef.current);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerTargetRef.current - Date.now()) / 1000));
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
        timerTargetRef.current = 0;
        setTimerRunning(false);
        setStepCompletePopup(true);
      }
    };
    tick();
    timerIntervalRef.current = window.setInterval(tick, 500);
  };

  const resetCurrentTimer = () => {
    if (!activeCooking) return;
    clearInterval(timerIntervalRef.current);
    timerTargetRef.current = 0;
    setTimerRunning(false);
    setStepCompletePopup(false);
    setTimerRemaining(activeCooking.recipe.steps[cookingStep]?.duration || 0);
  };


  const closeRestaurant = () => {
    setVegOnly(false);
    setAllergenSafeOnly(false);
    setRestaurantSearch("");
    setActiveRestaurant(null);
  };

  const toggleDishLike = (dishName) => {
    const dish = discoveryDishes.find((item) => item.name === dishName);
    if (!dish) return;
    toggleKikuSavedDish(dish);
    setLikedDishes(new Set(getKikuSavedItems().dishes.map((item) => item.name)));
  };

  const toggleRestaurantLike = (restaurantName) => {
    const restaurant = restaurantCatalog.find((item) => item.name === restaurantName);
    if (!restaurant) return;
    toggleKikuSavedRestaurant({ name: restaurant.name, cuisine: restaurant.cuisine });
    setLikedRestaurants(new Set(getKikuSavedItems().restaurants.map((item) => item.name)));
  };

  const restaurantCatalog = useMemo(() => {
    const grouped = new Map();
    discoveryDishes.forEach((dish) => {
      if (!grouped.has(dish.restaurant)) grouped.set(dish.restaurant, []);
      grouped.get(dish.restaurant).push(dish);
    });
    return [...grouped.entries()].map(([name, dishes]) => {
      const cuisine = (dishes[0]?.restaurantMeta || "").split(" • ")[0] || "Multi-cuisine";
      return { name, cuisine, dishes };
    });
  }, [discoveryDishes]);

  const similarDishes = useMemo(() => {
    if (!activeDish) return [];
    return discoveryDishes.filter((dish) => dish.name !== activeDish.name).slice(0, 8);
  }, [activeDish, discoveryDishes]);

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    if (searchResults.length) return searchResults.slice(0, 5);
    return discoveryDishes
      .filter((dish) => [dish.name, dish.restaurant, dish.descriptor, ...(dish.tags || [])].some((value) => String(value || "").toLowerCase().includes(query)))
      .slice(0, 5);
  }, [searchQuery, searchResults, discoveryDishes]);

  const runDishSearch = () => {
    const firstMatch = searchMatches[0];
    if (firstMatch) {
      openDish(firstMatch);
    }
  };

  const updateSimilarControls = () => {
    const rail = similarRailRef.current;
    if (!rail) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setSimilarScrollLeft(rail.scrollLeft);
    setSimilarCanScrollRight(rail.scrollLeft < maxScroll - 4);
  };

  useEffect(() => {
    const rail = similarRailRef.current;
    if (!rail || !activeDish) return undefined;

    rail.scrollLeft = 0;
    setSimilarScrollLeft(0);
    requestAnimationFrame(updateSimilarControls);

    const onScroll = () => updateSimilarControls();
    rail.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateSimilarControls());
    resizeObserver.observe(rail);

    return () => {
      rail.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, [activeDish, similarDishes.length]);

  const scrollSimilar = (direction) => {
    const rail = similarRailRef.current;
    if (!rail) return;
    const amount = Math.max(190, Math.min(rail.clientWidth * 0.72, 360));
    rail.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  const chooseMood = (mood) => {
    setSelectedMood(mood);
    if (isLoggedIn) {
      void api.activity({ type: "manual_mood_select", metadata: { mood } }).catch(() => {});
    }
    requestAnimationFrame(() => scrollToSection("discover"));
  };

  const stopMoodStream = () => {
    moodStreamRef.current?.getTracks().forEach((track) => track.stop());
    moodStreamRef.current = null;
    if (moodVideoRef.current) moodVideoRef.current.srcObject = null;
  };

  const stopMoodSampling = () => {
    moodSamplingActiveRef.current = false;
    moodSamplingBusyRef.current = false;
    if (moodSampleIntervalRef.current) {
      window.clearInterval(moodSampleIntervalRef.current);
      moodSampleIntervalRef.current = null;
    }
  };

  // Runs entirely on-device: reads a handful of blendshape frames captured
  // during the scan window (see startMoodScan below) and turns their
  // average into a Kiku mood + confidence. No frame or model output ever
  // leaves the browser.
  const finishScan = () => {
    stopMoodSampling();
    const samples = moodSamplesRef.current;
    const averaged = averageBlendshapes(samples.map((sample) => sample.blendshapes));
    const prediction = predictMoodFromBlendshapes(averaged);
    setDetectedMood(prediction);
    stopMoodStream();
    setScanStatus("idle");
    setMoodStage("result");
    if (isLoggedIn) {
      void api.activity({
        type: "mood_scan",
        metadata: { mood: prediction.mood, confidence: prediction.confidence / 100, sampleCount: samples.length },
      }).catch(() => {});
    }

  };

  const startMoodScan = async (facingMode = "user") => {
    window.clearTimeout(scanTimeoutRef.current);
    stopMoodSampling();
    stopMoodStream();
    warmUpMoodModel(); // no-op if already loaded/loading
    setScanStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      moodStreamRef.current = stream;
      if (moodVideoRef.current) {
        moodVideoRef.current.srcObject = stream;
        await moodVideoRef.current.play().catch(() => {});
      }
      setScanStatus("scanning");

      // Sample face signals a handful of times across the scan window
      // instead of relying on one frame, so a blink or a half-turned head
      // doesn't dominate the result.
      moodSamplesRef.current = [];
      moodSamplingActiveRef.current = true;
      moodSampleIntervalRef.current = window.setInterval(async () => {
        const video = moodVideoRef.current;
        if (!video || !moodSamplingActiveRef.current || moodSamplingBusyRef.current) return;
        moodSamplingBusyRef.current = true;
        try {
          const signals = await readFaceSignalsFromVideo(video);
          if (signals && moodSamplingActiveRef.current) moodSamplesRef.current.push(signals);
        } catch (error) {
          console.warn("Kiku mood sampling frame failed:", error);
        } finally {
          moodSamplingBusyRef.current = false;
        }
      }, 180);

      scanTimeoutRef.current = window.setTimeout(finishScan, 1800);
    } catch {
      setScanStatus("denied");
    }
  };

  const flipMoodCamera = () => {
    const track = moodStreamRef.current?.getVideoTracks?.()[0];
    const currentFacing = track?.getSettings?.().facingMode === "environment" ? "environment" : "user";
    const nextFacing = currentFacing === "user" ? "environment" : "user";
    startMoodScan(nextFacing);
  };

  const pickMoodManually = (moodName) => {
    window.clearTimeout(scanTimeoutRef.current);
    stopMoodStream();
    setScanStatus("idle");
    setDetectedMood({ mood: moodName, confidence: 100 });
    setMoodStage("result");
    if (isLoggedIn) void api.activity({ type: "manual_mood_select", metadata: { mood: moodName, source: "mood-scan-panel" } }).catch(() => {});
  };

  const retakeMoodScan = () => {
    window.clearTimeout(scanTimeoutRef.current);
    stopMoodSampling();
    stopMoodStream();
    setScanStatus("idle");
    setDetectedMood(null);
    setCraving(null);
    setBudget(null);
    setMoodStage("scan");
  };

  const findMoodFood = () => {
    if (detectedMood?.mood) chooseMood(detectedMood.mood);
    else scrollToSection("discover");
  };

  const handleHeroMoodScan = () => {
    // Keep the scan action inside the original user gesture so browsers can
    // honor getUserMedia permission prompts without requiring a second click.
    window.clearTimeout(scanTimeoutRef.current);
    stopMoodSampling();
    stopMoodStream();
    setScanStatus("idle");
    setDetectedMood(null);
    setCraving(null);
    setBudget(null);
    setMoodStage("scan");
    scrollToSection("mood");
    void startMoodScan();
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(scanTimeoutRef.current);
      stopMoodSampling();
      stopMoodStream();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(warmUpMoodModel, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const updateCarouselControls = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    setCarouselScrollLeft(carousel.scrollLeft);
    setCarouselCanScrollRight(carousel.scrollLeft < maxScroll - 4);
  };

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.scrollLeft = 0;
    setCarouselScrollLeft(0);
    requestAnimationFrame(updateCarouselControls);

    const onScroll = () => updateCarouselControls();
    carousel.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateCarouselControls());
    resizeObserver.observe(carousel);

    return () => {
      carousel.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, [visibleDishes.length]);

  const scrollCarousel = (direction) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const amount = Math.max(320, Math.min(carousel.clientWidth * 0.82, 560));
    carousel.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  const isNavItemActive = (item) => {
    if (item.activeKey === "home") return activeSection === "home";
    if (item.activeKey === "discover") return activeSection === "discover";
    if (item.activeKey === "search") return activeSection === "search";
    if (item.activeKey === "mood") return activeSection === "mood";
    if (item.activeKey === "recipes") return activeSection === "recipes";
    if (item.activeKey === "profile") return false;
    return false;
  };

  const recipeAllergenMatches = useMemo(() => {
    if (!activeRecipe?.recipe || activeRecipe.recipe.allergenVerified === true) return [];
    const allergies = getKikuPreferences().allergies || [];
    return detectPotentialAllergensFromIngredients(activeRecipe.recipe.ingredients, allergies);
  }, [activeRecipe, preferenceVersion]);

  if (authRoute === "login") {
  return (
      <LoginPage
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onSuccess={handleAuthSuccess}
        onSignup={() => navigateAuth("signup", getAuthReturn())}
        onSkip={handleSkipAuth}
      />
    );
  }

  if (authRoute === "signup") {
    return (
      <SignupPage
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onSuccess={handleAuthSuccess}
        onLogin={() => navigateAuth("login", getAuthReturn())}
        onSkip={handleSkipAuth}
      />
    );
  }

  if (authRoute === "forgot-password") {
    return <ForgotPasswordPage darkMode={darkMode} setDarkMode={setDarkMode} onBack={() => navigateAuth("login")} />;
  }

  if (authRoute === "reset-password") {
    return <ResetPasswordPage darkMode={darkMode} setDarkMode={setDarkMode} onDone={() => navigateAuth("login")} />;
  }

  if (authRoute === "verify-email") {
    return <VerifyEmailPage darkMode={darkMode} setDarkMode={setDarkMode} onDone={() => navigateAuth("login")} />;
  }

  if (publicInfoRoute) {
    return (
      <PublicInfoPage
        type={publicInfoRoute}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onHome={handlePublicHome}
        onNavigate={navigatePublicInfo}
        onManagePrivacy={openPrivacyControls}
      />
    );
  }

  if (profileRoute) {
    return (
      <ProfilePage
        isLoggedIn={isLoggedIn}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onClose={closeProfile}
        onSignOut={handleProfileSignOut}
        onLogin={handleSignIn}
        onGetStarted={() => navigateAuth("signup", "profile")}
        onOpenAssistant={() => { closeProfile(); requestAnimationFrame(() => setAssistantOpen(true)); }}
        onOpenDish={(dish) => { closeProfile(); requestAnimationFrame(() => openDish(dish)); }}
        onOpenRecipe={(dish) => { closeProfile(); requestAnimationFrame(() => openRecipe(dish)); }}
        onDeleted={handleAccountDeleted}
      />
    );
  }

  return (
    <main className={`landing-page ${darkMode ? "dark-mode" : ""}`}>
      <header className="navbar">
        <button className="brand" type="button" onClick={() => scrollToSection("home")} aria-label="Kiku home">
          <img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" />
        </button>

        <nav className="nav-links" aria-label="Primary navigation">
          {navItems.map((item) => {
            const target = item.target;
            const isActive = isNavItemActive(item);
            return (
              <button
                key={item.label}
                type="button"
                className={`nav-link ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (item.activeKey) setActiveSection(item.activeKey);
                  scrollToSection(target);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className={`pincode-action ${pincode ? "has-pin" : ""}`}
            onClick={() => setPincodeOpen(true)}
            aria-label={pincode ? `Change PIN code ${pincode}` : "Set PIN code"}
            title={pincode ? `PIN ${pincode} · change` : "Set PIN"}
          >
            <span className="pincode-label">PIN</span>
            <span className="pincode-value">{pincode || "Set"}</span>
          </button>

          <button
            type="button"
            className="assistant-action"
            onClick={openAssistant}
            aria-label="Kiku Assistant"
            title="Kiku Assistant"
          >
            <AssistantIcon />
            <span className="assistant-action-label">Assistant</span>
          </button>

          <button
            className="theme-toggle"
            type="button"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={darkMode}
            title={darkMode ? "Light mode" : "Dark mode"}
            onClick={() => setDarkMode((value) => !value)}
          >
            <ThemeIcon dark={darkMode} />
          </button>

          {authReady && !isLoggedIn && (
            <button className="sign-in" type="button" onClick={() => handleSignIn()}>
              Sign In
            </button>
          )}

        </div>
      </header>

      <section id="home" ref={homeRef} className="landing-shell page-section" aria-label="Kiku home">
        <div className="hero">
          <div className="hero-copy">
            <span className="eyebrow">FOOD FOR EVERY MOMENT</span>
            <h1>Food for<br />every mood.</h1>
            <h2>Listening to your expressions.</h2>
            <p>
              Let Kiku understand how you feel and discover
              <br className="desktop-break" />
              food that fits your every mood.
            </p>

            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={handleHeroMoodScan}>
                <span className="sparkle" aria-hidden="true">✦</span>
                <span>Scan My Mood</span>
              </button>
              <button className="secondary-button" type="button" onClick={() => scrollToSection("discover")}>
                <span className="person-icon" aria-hidden="true"><PersonIcon /></span>
                <span>Ask Kiku</span>
              </button>
            </div>
          </div>

          <div className="mood-section">
            <div className="mood-heading">
              <span className="search-symbol" aria-hidden="true"><SearchIcon /></span>
              <span>Or choose how you feel</span>
            </div>
            <div className="mood-list">
              {moods.map((mood) => (
                <button
                  key={mood.name}
                  type="button"
                  className={`mood-item ${mood.className} ${selectedMood === mood.name ? "selected" : ""}`}
                  onClick={() => chooseMood(mood.name)}
                  aria-pressed={selectedMood === mood.name}
                >
                  <span className="mood-icon">{mood.icon}</span>
                  <span className="mood-name">{mood.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="care-line">
          <span className="care-flower" aria-hidden="true">✿</span>
          <span>Loved food is a form of care.</span>
        </div>
      </section>

      <div className="section-transition" aria-hidden="true" />

      <section
        id="discover"
        ref={discoverRef}
        className="discover-section page-section"
        aria-label={discoverTitle}
      >
        <div className="discover-panel">
          <div className="discover-heading">
            <span className="eyebrow">{hasRecommendationData ? "PERSONALIZED FOR YOU" : "START EXPLORING"}</span>
            <h2>{discoverTitle}</h2>
            <h3>{discoverHeadline}</h3>
            <p>{discoverDescription}</p>
          </div>

          <div className="discover-toolbar">
            <div className="discover-filters" role="tablist" aria-label="Food filters">
              {['All', 'Order Online', 'Cook at Home', 'Healthy', 'Quick'].map((filter) => (
                <button key={filter} className={`discover-filter ${discoverFilter === filter ? "active" : ""}`} type="button" role="tab" aria-selected={discoverFilter === filter} onClick={() => setDiscoverFilter(filter)}>
                  {filter}
                </button>
              ))}
            </div>
            <button className="shuffle-button" type="button" onClick={() => setShuffleSeed((value) => value + 1)}>
              Shuffle
            </button>
          </div>

          {pincode && (regionStatus === "scraping" || regionStatus === "queued" || regionStatus === "ready" || regionStatus === "stale" || regionStatus === "error") && (
            <div className={`kiku-region-status kiku-region-status-${regionStatus}`} role="status" aria-live="polite">
              <span className="kiku-region-status-dot" aria-hidden="true" />
              <div>
                <strong>
                  {regionStatus === "scraping" ? `Finding food available near ${pincode}…` : regionStatus === "queued" ? `Your regional lookup for ${pincode} is queued…` : regionStatus === "ready" || regionStatus === "stale" ? `Regional data ready for ${pincode}` : `Regional lookup needs attention`}
                </strong>
                <span>
                  {regionStatus === "scraping" ? "Kiku is collecting provider data for your PIN. Other users and pincodes are processed independently." : null}
                  {regionStatus === "queued" ? "Kiku is keeping this PIN-specific request separate from other users." : null}
                  {regionStatus === "ready" || regionStatus === "stale" ? "Filters are applied to the regional catalog before dishes are shown." : null}
                  {regionStatus === "error" ? regionStatusError : null}
                </span>
              </div>
            </div>
          )}

          <div className="dish-carousel-wrap" aria-busy={regionStatus === "scraping" || regionStatus === "queued"}>
            {regionStatus === "scraping" || regionStatus === "queued" ? (
              <div className="kiku-region-dish-loading" role="status" aria-live="polite">
                <div className="kiku-region-dish-loading-orbit" aria-hidden="true" />
                <div>
                  <strong>{regionStatus === "scraping" ? `Finding dishes near ${pincode}…` : "Regional lookup is queued…"}</strong>
                  <span>Kiku will show this PIN's dishes as soon as the regional snapshot is ready. No unrelated region data is shown.</span>
                </div>
              </div>
            ) : null}

            {carouselScrollLeft > 12 && (
              <button
                className="dish-carousel-button dish-carousel-button-left"
                type="button"
                onClick={() => scrollCarousel(-1)}
                aria-label="Scroll dishes left"
              >
                &lt;
              </button>
            )}

            <div className="dish-carousel" ref={carouselRef}>
              {visibleDishes.map((dish) => (
                <article
                  className="dish-card"
                  key={dish.name}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${dish.name} details`}
                  onClick={() => openDish(dish)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDish(dish);
                    }
                  }}
                >
                  <div className={`dish-art ${dish.artClass}`}>
                    <span className="dish-glow" aria-hidden="true" />
                    <span className="dish-emoji" aria-hidden="true">{dish.art}</span>
                    <button
                      className={`save-dish ${likedDishes.has(dish.name) ? "liked" : ""}`}
                      type="button"
                      aria-label={`${likedDishes.has(dish.name) ? "Unlike" : "Like"} ${dish.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleDishLike(dish.name);
                      }}
                    >
                      {likedDishes.has(dish.name) ? "♥" : "♡"}
                    </button>
                  </div>

                  <div className="dish-body">
                    <div className="dish-meta-row">
                      <div>
                        <h4>{dish.name}</h4>
                        <button
                          className="dish-restaurant dish-restaurant-link"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const restaurant = restaurantCatalog.find((item) => item.name === dish.restaurant);
                            if (restaurant) openRestaurant(restaurant);
                          }}
                        >
                          {dish.restaurant}
                        </button>
                        <p>{dish.descriptor}</p>
                      </div>
                      <span className="dish-rating">★ {dish.rating}</span>
                    </div>

                    <div className="dish-tags">
                      {dish.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>

                    <div className="dish-stats dish-stats-no-price">
                      <span>{dish.time}</span>
                    </div>

                    <div className="dish-actions">
                      <button
                        className="card-primary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDish(dish);
                        }}
                      >
                        Order
                      </button>
                      <button
                        className="card-secondary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openRecipe(dish);
                        }}
                      >
                        Cook
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {carouselCanScrollRight && carouselRef.current && (
              <button
                className="dish-carousel-button dish-carousel-button-right"
                type="button"
                onClick={() => scrollCarousel(1)}
                aria-label="Scroll dishes right"
              >
                &gt;
              </button>
            )}
          </div>

          <div className="why-kiku">
            <div>
              <span className="eyebrow">{hasRecommendationData ? "WHY THESE PICKS" : "HOW DISCOVERY WORKS"}</span>
              <h3>{hasRecommendationData ? "Kiku used your current context" : "Start with what looks good"}</h3>
            </div>
            <div className="why-grid">
              {hasRecommendationData ? (
                <>
                  <span>♡ Matches your {selectedMood.toLowerCase()} moment</span>
                  <span>◌ Keeps your preferences in mind</span>
                  <span>✦ Balances variety with familiarity</span>
                  <span>⌁ Lets you order, compare, or cook</span>
                </>
              ) : (
                <>
                  <span>♡ Save dishes you like</span>
                  <span>✦ Choose a mood when you're ready</span>
                  <span>⌁ Explore different cuisines</span>
                  <span>◌ Kiku learns from your choices</span>
                </>
              )}
            </div>
          </div>

        </div>

          <section
            id="discover-search"
            ref={dishSearchSectionRef}
            className="kiku-discover-search"
            aria-label="Search food and deals"
          >
            <div className="kiku-search-copy">
              <span className="eyebrow">SEARCH WHAT YOU FEEL</span>
              <h3>Tell Kiku what you’re craving.</h3>
              <p>Search a dish, cuisine, restaurant, or feeling and we’ll surface the closest matches and the best available deal.</p>
            </div>

            <form className="kiku-search-box" onSubmit={(event) => { event.preventDefault(); runDishSearch(); }}>
              <span className="kiku-search-icon" aria-hidden="true"><SearchIcon /></span>
              <input
                ref={dishSearchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search what you feel…"
                aria-label="Search what you feel"
              />
              <button type="submit" aria-label="Search" disabled={!searchMatches.length}>Search</button>
            </form>

            <div className="kiku-search-suggestions" aria-label="Popular searches">
              {['something spicy', 'comfort food', 'quick dinner', 'under ₹300'].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="kiku-search-chip"
                  onClick={() => setSearchQuery(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {searchQuery.trim() && (
              <div className="kiku-search-results" aria-live="polite">
                {searchMatches.length ? searchMatches.map((dish) => (
                  <button
                    type="button"
                    className="kiku-search-result"
                    key={dish.name}
                    onClick={() => openDish(dish)}
                  >
                    <span className={`kiku-search-result-art ${dish.artClass}`} aria-hidden="true">{dish.art}</span>
                    <span className="kiku-search-result-copy">
                      <strong>{dish.name}</strong>
                      <span>{dish.restaurant} · {dish.descriptor}</span>
                    </span>
                    <span className="kiku-search-result-arrow">›</span>
                  </button>
                )) : (
                  <p className="kiku-search-empty">{(regionStatus === "scraping" || regionStatus === "queued") && pincode ? `Kiku is still finding results near ${pincode}…` : "Try a dish, restaurant, cuisine, or mood."}</p>
                )}
              </div>
            )}

            <div className="kiku-search-support">
              <span className="eyebrow">MADE FOR YOUR CRAVING</span>
              <h4>We find the food, prices, and recipes that fit your moment.</h4>
              <p>
                Tell Kiku what sounds good, and we’ll help narrow down the right dish or restaurant,
                surface the prices we can verify, and point you toward recipes when you’d rather cook at home.
              </p>
              <p className="kiku-search-support-note">
                Search naturally — from “something spicy tonight” to “easy paneer recipe” or “best price under ₹300”.
                Kiku is built to turn a vague craving into something you can actually choose.
              </p>
            </div>
          </section>
      </section>


      <section
        id="how-kiku-works"
        className="kiku-workflow-section page-section"
        aria-label="How Kiku works"
      >
        <div
          className="kiku-workflow-sticky"
          style={{
            "--workflow-step-index": workflowStep,
          } as CSSProperties & { "--workflow-step-index": number }}
        >
          <div className="kiku-workflow-visual">
          <div className="kiku-workflow-visual-card">
            <div className="workflow-petal workflow-petal-one" aria-hidden="true">✿</div>
            <div className="workflow-petal workflow-petal-two" aria-hidden="true">✿</div>

            <div className="workflow-visual-topline">
              <span>{workflowStages[workflowStep].number}</span>
              <span>KIKU / YOUR FOOD JOURNEY</span>
            </div>

            <div
              className={`workflow-visual-art ${workflowStages[workflowStep].visualClass}`}
              aria-hidden="true"
            >
              <span>{workflowStages[workflowStep].visualArt}</span>
            </div>

            <div className="workflow-visual-copy">
              <span className="eyebrow">{workflowStages[workflowStep].visualKicker}</span>
              <h3>{workflowStages[workflowStep].visualTitle}</h3>
              <p>{workflowStages[workflowStep].visualDescription}</p>
            </div>
          </div>
        </div>

        <div className="kiku-workflow-content">
          <span className="eyebrow">HOW KIKU WORKS</span>
          <h2>From your area<br />to your plate.</h2>
          <p className="kiku-workflow-intro">
            Five simple steps turn a vague craving into a nearby dish, a price you can compare,
            or a recipe you can make at home.
          </p>

          <div className="kiku-workflow-hint" aria-hidden="true">
            <span>SCROLL TO EXPLORE</span>
            <span>•</span>
            <span>TAP A STEP TO JUMP</span>
          </div>

          <div className="kiku-workflow-steps">
            {workflowStages.map((stage, index) => (
              <button
                key={stage.number}
                ref={(node) => { workflowStepRefs.current[index] = node; }}
                type="button"
                className={`kiku-workflow-step ${workflowStep === index ? "active" : ""}`}
                onClick={() => scrollToWorkflowStep(index)}
                aria-current={workflowStep === index ? "step" : undefined}
              >
                <span className="kiku-workflow-step-number">{stage.number}</span>
                <span className="kiku-workflow-step-copy">
                  <strong>{stage.title}</strong>
                  {workflowStep === index ? (
                    <span>{stage.description}</span>
                  ) : (
                    <em>{stage.short}</em>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      </section>

      <div className="section-transition" aria-hidden="true" />

      <section
        id="mood"
        ref={moodRef}
        className={`kiku-mood-section page-section ${moodStage === "scan" ? "kiku-mood-section-scan" : ""}`}
        aria-label="Mood-based food finder"
      >
        <div className={`kiku-mood-inner ${moodStage === "scan" ? "kiku-mood-inner-scan" : ""}`}>
          {moodStage === "scan" ? (
            <div className="kiku-mood-scan kiku-mood-scan-split animate-in">
              <div className="kiku-mood-copy">
                <span className="eyebrow">Can't decide what to eat? worry not…</span>
                <h2>Let Kiku read the room.</h2>
                <p className="kiku-mood-subtext kiku-mood-privacy">
                  Your camera is used locally to estimate your current expression. Nothing is uploaded.
                </p>
                <p className="kiku-mood-subtext kiku-mood-explainer">
                  Once your scan (or manual pick) tells Kiku how you're feeling, it matches that
                  mood against dishes that fit the moment — comforting, quick, indulgent, whatever
                  the moment calls for — instead of just showing you the same generic menu. For
                  every dish it suggests, Kiku can check current menu prices across supported
                  platforms side-by-side, so you can compare the same dish before choosing where
                  to order or cook at home.
                </p>
              </div>

              <div className="kiku-mood-camera-column">
                <div className="kiku-mood-status kiku-mood-status-top">
                  <span className={`kiku-mood-status-dot status-${scanStatus}`} aria-hidden="true" />
                  <span>
                    {scanStatus === "idle" && "Ready to scan"}
                    {scanStatus === "requesting" && "Requesting camera access…"}
                    {scanStatus === "scanning" && "Scanning your expression…"}
                    {scanStatus === "denied" && "Camera unavailable — try again"}
                  </span>
                </div>

                <div className="kiku-mood-camera">
                  <span className="kiku-mood-corner kiku-mood-corner-tl" aria-hidden="true" />
                  <span className="kiku-mood-corner kiku-mood-corner-tr" aria-hidden="true" />
                  <span className="kiku-mood-corner kiku-mood-corner-bl" aria-hidden="true" />
                  <span className="kiku-mood-corner kiku-mood-corner-br" aria-hidden="true" />

                  {scanStatus === "scanning" || scanStatus === "requesting" ? (
                    <video ref={moodVideoRef} className="kiku-mood-video" muted playsInline autoPlay />
                  ) : (
                    <div className="kiku-mood-camera-placeholder">
                      <CameraOffIcon />
                    </div>
                  )}

                  {scanStatus === "scanning" && (
                    <button
                      className="kiku-mood-flip"
                      type="button"
                      onClick={flipMoodCamera}
                      aria-label="Switch camera"
                      title="Switch camera"
                    >
                      <FlipCameraIcon />
                    </button>
                  )}

                  {scanStatus === "scanning" && <span className="kiku-mood-scan-line" aria-hidden="true" />}
                </div>

                <button
                  className="primary-button kiku-mood-scan-button"
                  type="button"
                  onClick={() => startMoodScan()}
                  disabled={scanStatus === "requesting" || scanStatus === "scanning"}
                >
                  <span className="sparkle" aria-hidden="true">✦</span>
                  <span>{scanStatus === "scanning" ? "Scanning…" : "Start Scan"}</span>
                </button>
              </div>

              <div className="care-line kiku-mood-care-line">
                <span className="care-flower" aria-hidden="true">✿</span>
                <span>Good food is a form of care.</span>
              </div>
            </div>
          ) : (
            <div className="kiku-mood-result animate-in">
              <span className="kiku-mood-result-kicker">Your expression suggests</span>

              <div className="kiku-mood-badge">
                <span aria-hidden="true">{moods.find((item) => item.name === detectedMood?.mood)?.icon ?? "🙂"}</span>
              </div>

              <h2 className="kiku-mood-result-name">{detectedMood?.mood ?? "Balanced"}</h2>
              <p className="kiku-mood-result-confidence">{detectedMood?.confidence ?? 0}% confidence</p>

              <p className="kiku-mood-quote">
                “{moodQuotes[detectedMood?.mood] ?? "Let's find something that fits this moment."}”
              </p>

              <div className="kiku-mood-field">
                <h4>What are you craving?</h4>
                <div className="kiku-mood-chips">
                  {cravingOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`kiku-mood-chip ${craving === option ? "active" : ""}`}
                      onClick={() => setCraving(option)}
                      aria-pressed={craving === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="kiku-mood-field">
                <h4>Budget</h4>
                <div className="kiku-mood-chips">
                  {budgetOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`kiku-mood-chip ${budget === option ? "active" : ""}`}
                      onClick={() => setBudget(option)}
                      aria-pressed={budget === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <button className="primary-button kiku-mood-find-button" type="button" onClick={findMoodFood}>
                Find My Food
              </button>

              <button className="kiku-mood-retake" type="button" onClick={retakeMoodScan}>
                Retake Scan
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="section-transition" aria-hidden="true" />

      <section
        id="recipes"
        ref={recipesRef}
        className="kiku-recipes-section page-section"
        aria-label="Kiku recipes"
      >
        <div className="kiku-recipes-shell">
          <div className="kiku-recipes-heading">
            <span className="eyebrow">WOAH… YOU WANT TO COOK?</span>
            <h2>Let me help you find the best recipe ever.</h2>
            <p>And also make sure you don't burn everything down.</p>
          </div>

          <div className="kiku-recipes-search-wrap">
            <span className="kiku-recipes-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={recipeQuery}
              onChange={(event) => setRecipeQuery(event.target.value)}
              placeholder="Search a dish, cuisine, or craving…"
              aria-label="Search recipes"
            />
            <button
              type="button"
              className="kiku-recipes-search-button"
              onClick={() =>
                document.getElementById("recipes-grid")?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                })
              }
            >
              Search
            </button>
          </div>

          <div className="kiku-recipes-helper">
            <span>Try “easy paneer”, “quick dinner”, or “something comforting”.</span>
            <span className="kiku-recipes-helper-dot" aria-hidden="true">✿</span>
            <span>Live recipes are refreshed from Kiku's recipe feed.</span>
          </div>

          <div id="recipes-grid" className="kiku-recipes-grid" aria-live="polite">
            {recipesLoading &&
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="kiku-recipe-card kiku-recipe-card-skeleton"
                  key={`recipe-skeleton-${index}`}
                >
                  <div className="kiku-recipe-image-skeleton" />
                  <div className="kiku-recipe-skeleton-line large" />
                  <div className="kiku-recipe-skeleton-line" />
                </div>
              ))}

            {!recipesLoading && !recipesError && visibleRecipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="kiku-recipe-card"
                onClick={() => openRecipeFromFeed(recipe)}
                aria-label={`Open recipe ${recipe.title}`}
              >
                <div className="kiku-recipe-image">
                  {recipe.image ? (
                    <img src={recipe.image} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">✿</span>
                  )}
                  <span className="kiku-recipe-card-chip">RECIPE</span>
                </div>

                <div className="kiku-recipe-card-body">
                  <div className="kiku-recipe-card-meta">
                    <span>{recipe.cuisine || "From Kiku's recipe feed"}</span>
                    {recipe.time && <span>{recipe.time}</span>}
                  </div>

                  <h3>{recipe.title}</h3>
                  {recipe.description && <p>{recipe.description}</p>}

                  <span className="kiku-recipe-open">
                    View recipe <span aria-hidden="true">→</span>
                  </span>
                </div>
              </button>
            ))}

            {!recipesLoading && recipesError && (
              <div className="kiku-recipes-state">
                <strong>Recipes are taking a little longer.</strong>
                <span>{recipesError}</span>
              </div>
            )}

            {!recipesLoading && !recipesError && recipes.length === 0 && (
              <div className="kiku-recipes-state">
                <strong>No recipes are available right now.</strong>
                <span>The live recipe feed will appear here when results are available.</span>
              </div>
            )}

            {!recipesLoading && !recipesError && recipes.length > 0 && visibleRecipes.length === 0 && (
              <div className="kiku-recipes-state">
                <strong>No recipe matches that search.</strong>
                <span>Try a broader craving, cuisine, or dish name.</span>
              </div>
            )}
          </div>
        </div>
      </section>


      <section id="kiku-finale" className="kiku-finale page-section" aria-label="The Kiku way">
        <div className="kiku-finale-hero">
          <div className="kiku-finale-orbit kiku-finale-orbit-one" aria-hidden="true"></div>
          <div className="kiku-finale-orbit kiku-finale-orbit-two" aria-hidden="true"></div>
          <div className="kiku-finale-hero-inner">
            <span className="kiku-finale-kicker">THE KIKU WAY</span>
            <h2>FROM CRAVING<br className="desktop-only" /> TO FINAL BITE.</h2>
            <p>
              Tell Kiku what feels right. We’ll help you find what is available around you,
              compare the details that matter, and choose whether to order or cook.
            </p>
            <div className="kiku-finale-actions">
              <a className="kiku-finale-primary kiku-finale-signup" href="/signup" aria-label="Get started with Kiku">
                <span className="kiku-finale-primary-arrow" aria-hidden="true">→</span>
                <span>Get started</span>
              </a>
              <button type="button" className="kiku-finale-secondary" onClick={() => scrollToSection("recipes")}>
                Explore recipes
              </button>
            </div>
          </div>
        </div>

      </section>

      <footer className="kiku-footer">
        <div className="kiku-footer-main">
          <div className="kiku-footer-brand">
            <button className="kiku-footer-logo" type="button" onClick={() => scrollToSection("home")} aria-label="Kiku home">
              <img src={darkMode ? "/logo-dark.png" : "/logo.png"} alt="Kiku" />
            </button>
            <p>Food for every mood. Discover dishes, compare menu prices, find recipes, and choose what fits the moment.</p>
            <div className="kiku-footer-note">Loved food is a form of care. <span aria-hidden="true">✿</span></div>
          </div>

          <div className="kiku-footer-column">
            <span>EXPLORE</span>
            <button type="button" onClick={() => scrollToSection("home")}>Home</button>
            <button type="button" onClick={() => scrollToSection("discover")}>Discover</button>
            <button type="button" onClick={() => scrollToSection("discover-search")}>Search</button>
            <button type="button" onClick={() => scrollToSection("mood")}>Mood</button>
            <button type="button" onClick={() => scrollToSection("recipes")}>Recipes</button>
          </div>

          <div className="kiku-footer-column">
            <span>AT KIKU</span>
            <button type="button" onClick={openAssistant}>Ask Kiku</button>
            <button type="button" onClick={() => navigatePublicInfo("how-it-works")}>How Kiku works</button>
            <button type="button" onClick={() => navigatePublicInfo("about")}>About Kiku</button>
            <button type="button" onClick={() => navigatePublicInfo("support")}>Support</button>
          </div>

          <div className="kiku-footer-column">
            <span>YOUR JOURNEY</span>
            <button type="button" onClick={() => setPincodeOpen(true)}>Set your area</button>
            <button type="button" onClick={() => scrollToSection("mood")}>Tell us the moment</button>
            <button type="button" onClick={() => scrollToSection("discover")}>Explore nearby choices</button>
            <button type="button" onClick={() => scrollToSection("discover-search")}>Compare the options</button>
            <button type="button" onClick={() => scrollToSection("recipes")}>Order or cook</button>
          </div>
        </div>

        <div className="kiku-footer-bottom">
          <div className="kiku-footer-credit-group">
            <span>© 2026 Kiku. Good food, thoughtfully found.</span>
            <a className="kiku-footer-portfolio" href="https://ashutosh-creates.ashutoshpundhir12.workers.dev/" target="_blank" rel="noreferrer">
              Designed &amp; developed by Ashutosh Pundhir ↗
            </a>
          </div>
          <div className="kiku-footer-bottom-links">
            <button type="button" onClick={() => navigatePublicInfo("about")}>About</button>
            <button type="button" onClick={() => navigatePublicInfo("privacy")}>Privacy Policy</button>
            <button type="button" onClick={() => navigatePublicInfo("terms")}>Terms</button>
            <button type="button" onClick={() => navigatePublicInfo("accessibility")}>Accessibility</button>
          </div>
        </div>
      </footer>

      {activeDish && (
        <div
          className="dish-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDish();
          }}
        >
          <div
            className="dish-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dish-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dish-modal-top-actions">
              <button className="dish-modal-back" type="button" onClick={goBackFromDish} aria-label="Go back">
                ←
              </button>
              <button className="dish-modal-close" type="button" onClick={closeDish} aria-label="Close dish details">
                ×
              </button>
            </div>

            <div className="dish-modal-header">
              <div className={`dish-modal-art ${activeDish.artClass}`}>
                <span className="dish-emoji" aria-hidden="true">{activeDish.art}</span>
              </div>

              <div className="dish-modal-title">
                <span className="eyebrow">DISH DETAILS</span>
                <h2 id="dish-modal-title">{activeDish.name}</h2>
                <button
                  className="dish-modal-restaurant dish-modal-restaurant-link"
                  type="button"
                  onClick={() => {
                    const restaurant = restaurantCatalog.find((item) => item.name === activeDish.restaurant);
                    if (restaurant) openRestaurant(restaurant);
                  }}
                >
                  {activeDish.restaurant}
                </button>
                <p className="dish-modal-meta">{(activeDish.restaurantMeta || "").split(" • ")[0]}</p>
              </div>

            </div>

            <p className="dish-modal-description">
              Compare this dish from the same restaurant across supported platforms, or cook it at home.
            </p>

            <div className="dish-modal-compare">
              {(["swiggy", "zomato"]).map((provider) => {
                const offer = liveComparison?.offers?.find((item) => item.platform === provider);
                const label = provider === "swiggy" ? "Swiggy" : "Zomato";
                return (
                  <div className={`dish-modal-provider ${provider}`} key={provider}>
                    <div className="provider-heading"><span className="provider-mark" aria-hidden="true">{provider === "swiggy" ? "S" : "z"}</span><strong>{label}</strong></div>
                    <div className="provider-price">{offer?.price != null ? `₹${Math.round(offer.price)}` : "—"}</div>
                    <div className="provider-lines">
                      <div><span>Dish</span><strong>{offer?.dishName || activeDish.name}</strong></div>
                      <div><span>Price</span><strong>{offer?.price != null ? `₹${Math.round(offer.price)}` : "Not available"}</strong></div>
                      <div><span>Listed</span><strong>{offer?.listed ? "Yes" : "No current listing"}</strong></div>
                    </div>
                    {offer?.restaurantUrl && <button className="provider-order" type="button" onClick={() => { void api.activity({ type: "order_link_open", entityType: "dish", entityId: activeDish.name, metadata: { provider } }).catch(() => {}); window.open(offer.restaurantUrl, "_blank", "noopener,noreferrer"); }}>Open on {label}</button>}
                  </div>
                );
              })}
            </div>

            <div className="dish-modal-comparison-alert" role="note">
              <span aria-hidden="true">ⓘ</span>
              <span>Prices shown do not include tax, service/platform fees, or delivery charges. Those are calculated by each platform based on your location.</span>
            </div>

            {liveComparison?.cheapestPlatform && liveComparison.offers.some((offer) => offer.price != null) && (
              <div className="dish-modal-savings"><span aria-hidden="true">✓</span><strong>{liveComparison.cheapestPlatform === "swiggy" ? "Swiggy" : "Zomato"} currently lists the lower dish price.</strong></div>
            )}

            {liveComparison?.warnings?.length > 0 && (
              <div className="dish-modal-note">{liveComparison.warnings[0]}</div>
            )}
            {liveComparison && (getKikuPreferences().dietary.length || getKikuPreferences().allergies.length) && !liveComparison.offers.length && (
              <div className="dish-modal-note">No provider listing is shown because Kiku could not verify the selected dietary/allergen requirements. Kiku does not infer safety from the dish name.</div>
            )}

            <div className="dish-modal-note">
              {comparisonStatus === "loading" && "Checking live dish prices…"}
              {comparisonStatus === "live" && "Prices fetched live just now and may vary."}
              {comparisonStatus === "fallback" && "Live prices are unavailable right now. Kiku is not substituting invented or hard-coded provider prices."}
              {comparisonStatus === "idle" && "Live prices are checked when you open a dish."}
            </div>

            <div className="similar-dishes">
              <div className="similar-dishes-heading">
                <h3>Similar Dishes</h3>
              </div>

              <div className="similar-dishes-wrap">
                {similarScrollLeft > 12 && (
                  <button
                    className="similar-carousel-button similar-carousel-button-left"
                    type="button"
                    onClick={() => scrollSimilar(-1)}
                    aria-label="Scroll similar dishes left"
                  >
                    &lt;
                  </button>
                )}

                <div className="similar-dishes-rail" ref={similarRailRef}>
                  {similarDishes.map((dish) => (
                    <button
                      className="similar-dish-card"
                      type="button"
                      key={dish.name}
                      onClick={() => openDish(dish, { pushHistory: true })}
                    >
                      <div className={`similar-dish-art ${dish.artClass}`}>
                        <span aria-hidden="true">{dish.art}</span>
                      </div>
                      <strong>{dish.name}</strong>
                      <span>{dish.restaurant}</span>
                    </button>
                  ))}
                </div>

                {similarCanScrollRight && (
                  <button
                    className="similar-carousel-button similar-carousel-button-right"
                    type="button"
                    onClick={() => scrollSimilar(1)}
                    aria-label="Scroll similar dishes right"
                  >
                    &gt;
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeRestaurant && (
        <div
          className="dish-modal-backdrop restaurant-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRestaurant();
          }}
        >
          <div
            className="dish-modal restaurant-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restaurant-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="dish-modal-close" type="button" onClick={closeRestaurant} aria-label="Close restaurant details">
              ×
            </button>

            <div className="restaurant-modal-hero">
              <div className="restaurant-modal-art dish-art-rose" aria-hidden="true">
                <span className="restaurant-modal-emoji">🍽️</span>
              </div>
              <div className="restaurant-modal-title">
                <span className="eyebrow">RESTAURANT</span>
                <h2 id="restaurant-modal-title">{activeRestaurant.name}</h2>
                <p>{activeRestaurant.cuisine}</p>
              </div>
              <button
                className={`restaurant-like-button restaurant-like-hero ${likedRestaurants.has(activeRestaurant.name) ? "liked" : ""}`}
                type="button"
                aria-label={`${likedRestaurants.has(activeRestaurant.name) ? "Unlike" : "Like"} ${activeRestaurant.name}`}
                onClick={() => toggleRestaurantLike(activeRestaurant.name)}
              >
                {likedRestaurants.has(activeRestaurant.name) ? "♥" : "♡"}
              </button>
            </div>

            <div className="restaurant-modal-controls">
              <label className="restaurant-menu-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={restaurantSearch}
                  onChange={(event) => setRestaurantSearch(event.target.value)}
                  placeholder="Search dishes..."
                  aria-label="Search dishes"
                />
              </label>

              <button
                className={`veg-icon-toggle ${vegOnly ? "active" : ""}`}
                type="button"
                aria-label={vegOnly ? "Show all dishes" : "Show verified vegetarian dishes only"}
                aria-pressed={vegOnly}
                onClick={() => setVegOnly((value) => !value)}
                title={vegOnly ? "Show all dishes" : "Verified vegetarian only"}
              >
                <span className="veg-symbol" aria-hidden="true"><span /></span>
              </button>
              <button
                className={`dietary-safe-toggle ${allergenSafeOnly ? "active" : ""}`}
                type="button"
                aria-label={allergenSafeOnly ? "Show all dishes" : "Show allergen-verified safe dishes only"}
                aria-pressed={allergenSafeOnly}
                onClick={() => setAllergenSafeOnly((value) => !value)}
                title={allergenSafeOnly ? "Show all dishes" : "Verified allergen-safe only"}
              >
                <span aria-hidden="true">✓</span> SAFE
              </button>
            </div>

            <div className="restaurant-menu-list">
              {activeRestaurant.dishes
                .filter((dish) => {
                  const prefs = getKikuPreferences();
                  return matchesDietaryFilter(dish, {
                    dietary: vegOnly ? ["vegetarian"] : [],
                    allergies: prefs.allergies,
                    allergenFreeOnly: allergenSafeOnly && prefs.allergies.length === 0,
                  });
                })
                .filter((dish) => {
                  const query = restaurantSearch.trim().toLowerCase();
                  if (!query) return true;
                  return [dish.name, dish.descriptor, ...dish.tags]
                    .join(" ")
                    .toLowerCase()
                    .includes(query);
                })
                .map((dish) => (
                  <article className="restaurant-menu-item" key={dish.name}>
                    <button
                      className={`restaurant-menu-art restaurant-menu-art-button ${dish.artClass}`}
                      type="button"
                      onClick={() => openDish(dish, { fromRestaurant: activeRestaurant })}
                      aria-label={`Open ${dish.name} details`}
                    >
                      <span aria-hidden="true">{dish.art}</span>
                    </button>
                    <div className="restaurant-menu-copy">
                      <button
                        className="restaurant-menu-name-button"
                        type="button"
                        onClick={() => openDish(dish, { fromRestaurant: activeRestaurant })}
                      >
                        <h4>{dish.name}</h4>
                      </button>
                      <p>{dish.descriptor}</p>
                      <div className="restaurant-menu-tags">
                        {dish.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    </div>
                    <div className="restaurant-menu-actions">
                      <button
                        className={`restaurant-like-button ${likedDishes.has(dish.name) ? "liked" : ""}`}
                        type="button"
                        aria-label={`${likedDishes.has(dish.name) ? "Unlike" : "Like"} ${dish.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleDishLike(dish.name);
                        }}
                      >
                        {likedDishes.has(dish.name) ? "♥" : "♡"}
                      </button>
                      <button className="restaurant-compare" type="button" onClick={() => openDish(dish)}>
                        Compare
                      </button>
                    </div>
                  </article>
                ))}

              {activeRestaurant.dishes
                .filter((dish) => {
                  const prefs = getKikuPreferences();
                  return matchesDietaryFilter(dish, {
                    dietary: vegOnly ? ["vegetarian"] : [],
                    allergies: prefs.allergies,
                    allergenFreeOnly: allergenSafeOnly && prefs.allergies.length === 0,
                  });
                })
                .filter((dish) => {
                  const query = restaurantSearch.trim().toLowerCase();
                  if (!query) return true;
                  return [dish.name, dish.descriptor, ...dish.tags]
                    .join(" ")
                    .toLowerCase()
                    .includes(query);
                }).length === 0 && (
                  <div className="restaurant-empty-state">
                    {restaurantSearch.trim() ? "No dishes match your search." : "No vegetarian dishes are available right now."}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {activeRecipe && (
        <div className="kiku-fullpage-backdrop recipe-backdrop" role="presentation">
          <div className="recipe-page" role="dialog" aria-modal="true" aria-labelledby="recipe-page-title">
            <div className={`recipe-hero ${activeRecipe.recipe.accentClass || "recipe-accent-rose"}`}>
              {activeRecipe.recipe.image ? (
                <img src={activeRecipe.recipe.image} alt="" />
              ) : (
                <div className="recipe-hero-fallback" aria-hidden="true">
                  <span>{activeRecipe.recipe.emoji || activeRecipe.dish.art || "🍽️"}</span>
                  <small>{activeRecipe.recipe.cuisine || activeRecipe.dish.restaurantMeta || "Kiku kitchen"}</small>
                </div>
              )}
              <div className="recipe-hero-actions">
                <button type="button" className="recipe-icon-button" onClick={closeRecipe} aria-label="Back to recipes">‹</button>
                <span className="recipe-hero-spacer" />
                {activeRecipe.recipe.sourceUrl ? (
                  <a href={activeRecipe.recipe.sourceUrl} target="_blank" rel="noreferrer" className="recipe-icon-button recipe-source-button" aria-label="Open original recipe source">↗</a>
                ) : null}
                <button
                  type="button"
                  className={`recipe-icon-button ${savedRecipes.has(activeRecipe.dish.name) ? "saved" : ""}`}
                  onClick={() => toggleRecipeSaved(activeRecipe.dish.name)}
                  aria-label={savedRecipes.has(activeRecipe.dish.name) ? "Remove saved recipe" : "Save recipe"}
                >
                  {savedRecipes.has(activeRecipe.dish.name) ? "♥" : "♡"}
                </button>
              </div>
            </div>

            <div className="recipe-body">
              <div className="recipe-title-row">
                <div className="recipe-title-copy">
                  <span className="recipe-eyebrow">{activeRecipe.recipe.cuisine || activeRecipe.dish.restaurantMeta || "KIKU RECIPE"}</span>
                  <h1 id="recipe-page-title">{activeRecipe.dish.name}</h1>
                  <div className="recipe-stat-row">
                    <span>☆ {activeRecipe.recipe.rating || "Not provided by source"}</span>
                    {activeRecipe.recipe.prepTime ? <span>Prep {activeRecipe.recipe.prepTime}</span> : null}
                    {activeRecipe.recipe.cookTime ? <span>Cook {activeRecipe.recipe.cookTime}</span> : null}
                    {activeRecipe.recipe.time ? <span>Total {activeRecipe.recipe.time}</span> : null}
                    {activeRecipe.recipe.difficulty ? <span>{activeRecipe.recipe.difficulty}</span> : null}
                  </div>
                </div>
                <div className="recipe-title-actions">
                  <div className="recipe-serving-summary">
                    <span>SERVINGS</span>
                    <strong>{recipeServingCount > 0 ? recipeServingCount : "—"}</strong>
                  </div>
                  <button type="button" className="recipe-quick-chef" onClick={() => startCooking(0)} disabled={!activeRecipe.recipe.steps?.length}>
                    <span>♨</span>
                    <small>Kitchen mode</small>
                  </button>
                </div>
              </div>

              {activeRecipe.recipe.allergenVerified !== true ? (
                <div className="recipe-allergen-banner" role="note" aria-label="Allergen verification notice">
                  <div className="recipe-allergen-banner-icon" aria-hidden="true">!</div>
                  <div>
                    <strong>Allergen safety not verified</strong>
                    <p>Kiku does not have provider-verified allergen data for this recipe. Check the ingredient list and the original source before cooking if you have an allergy.</p>
                    {recipeAllergenMatches.length > 0 ? <p className="recipe-allergen-match"><strong>Potential ingredient match:</strong> {recipeAllergenMatches.join(", ")}. This is a text match, not a safety determination.</p> : null}
                  </div>
                </div>
              ) : null}

              {activeRecipe.recipe.description ? <p className="recipe-description">{activeRecipe.recipe.description}</p> : null}

              <div className="recipe-overview-grid">
                <section className="recipe-overview-card recipe-overview-card-wide">
                  <span className="recipe-section-kicker">BEFORE YOU START</span>
                  <h2>Set yourself up for an easier cook.</h2>
                  <div className="recipe-overview-chips">
                    {(activeRecipe.recipe.equipment || []).slice(0, 5).map((item) => <span key={item}>✓ {item}</span>)}
                  </div>
                </section>
                <section className="recipe-serving-card">
                  <div>
                    <span className="recipe-section-kicker">PORTIONS</span>
                    <strong>{recipeServingCount > 0 ? `${recipeServingCount} servings` : "Serving count not provided"}</strong>
                  </div>
                  {recipeServingCount > 0 ? (
                    <div className="recipe-serving-controls">
                      <button type="button" onClick={() => adjustServings(-1)} disabled={recipeServingCount <= 1} aria-label="Decrease servings">−</button>
                      <span>{recipeServingCount}</span>
                      <button type="button" onClick={() => adjustServings(1)} disabled={recipeServingCount >= 12} aria-label="Increase servings">+</button>
                    </div>
                  ) : null}
                  <small>{recipeServingCount > 0 ? "Ingredients update automatically." : "Kiku won't invent a serving size. Ask Kiku to research it."}</small>
                </section>
              </div>

              <div className="recipe-tabs" role="tablist" aria-label="Recipe details">
                {[
                  ["Ingredients", "Ingredients"],
                  ["Steps", "Method"],
                  ["Nutrition", "Nutrition"],
                  ["Tips", "Tips & swaps"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={recipeTab === value}
                    className={recipeTab === value ? "active" : ""}
                    onClick={() => setRecipeTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {recipeTab === "Ingredients" && (
                <div className="recipe-detail-panel">
                  <div className="recipe-panel-heading">
                    <div>
                      <span className="recipe-section-kicker">WHAT YOU'LL NEED</span>
                      <h2>{recipeServingCount > 0 ? `Ingredients for ${recipeServingCount} servings` : "Ingredients"}</h2>
                    </div>
                    <span>{activeRecipe.recipe.ingredients.length} items</span>
                  </div>
                  <div className="recipe-ingredient-panel">
                    {activeRecipe.recipe.ingredients.map(([name, amount]) => (
                      <div className="recipe-ingredient-row" key={name}>
                        <div className="recipe-ingredient-main"><span className="recipe-ingredient-dot">•</span><span>{name}</span></div>
                        <span className="ingredient-amount">{scaledRecipeAmount(amount)}</span>
                        <button type="button" className="ingredient-swap-button" onClick={() => openSubstitutionModal(name, activeRecipe)} aria-label={`Swap ${name}`}>Swap</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recipeTab === "Steps" && (
                <div className="recipe-detail-panel">
                  <div className="recipe-panel-heading">
                    <div>
                      <span className="recipe-section-kicker">METHOD</span>
                      <h2>Cook it step by step</h2>
                    </div>
                    <span>Tap any step to start there</span>
                  </div>
                  <div className="recipe-info-panel recipe-method-panel">
                    {activeRecipe.recipe.steps.map((step, index) => (
                      <button key={`${step.name}-${index}`} type="button" onClick={() => startCooking(index)} className="recipe-step-row recipe-step-row-rich">
                        <span className="recipe-step-number">{index + 1}</span>
                        <span className="recipe-step-copy">
                          <strong>{step.name}</strong>
                          <em>{step.duration ? `Timer ${formatTimer(step.duration)}` : "No timer"}{step.heat ? ` · ${step.heat}` : ""}</em>
                          <span>{step.instruction}</span>
                          {step.cue ? <small><b>Look for:</b> {step.cue}</small> : null}
                        </span>
                        <span className="recipe-step-arrow">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recipeTab === "Nutrition" && (
                <div className="recipe-detail-panel">
                  <div className="recipe-panel-heading">
                    <div>
                      <span className="recipe-section-kicker">NUTRITION</span>
                      <h2>What we know about this recipe</h2>
                    </div>
                  </div>
                  {activeRecipe.recipe.nutrition ? (
                    <div className="recipe-nutrition-grid">
                      {Object.entries(activeRecipe.recipe.nutrition as Record<string, string | boolean | null | undefined>).filter(([, value]) => Boolean(value)).map(([key, value]) => (
                        <div className="recipe-nutrition-card" key={key}><span>{key}</span><strong>{value}</strong></div>
                      ))}
                    </div>
                  ) : (
                    <div className="recipe-data-unavailable">
                      <div className="recipe-data-icon">i</div>
                      <div><strong>Kiku couldn't verify nutrition data for this recipe.</strong><p>Nutrition is shown only when a trusted source provides it. Kiku won't invent calorie or nutrient values.</p></div>
                    </div>
                  )}
                </div>
              )}

              {recipeTab === "Tips" && (
                <div className="recipe-detail-panel">
                  <div className="recipe-panel-heading">
                    <div>
                      <span className="recipe-section-kicker">TIPS & SWAPS</span>
                      <h2>Small things that make a big difference</h2>
                    </div>
                  </div>
                  <div className="recipe-tip-grid">
                    {activeRecipe.recipe.steps.filter((step) => step.tip).map((step) => <article key={step.name}><span>{step.name}</span><p>{step.tip}</p></article>)}
                  {activeRecipe.recipe.steps.filter((step) => step.heat || step.cue).length === 0 && activeRecipe.recipe.steps.length > 0 ? (
                    <article><span>Need more guidance?</span><p>Kiku can research missing cooking cues or explain a step without changing the canonical recipe.</p><button type="button" className="recipe-inline-action" onClick={() => { openAssistant(activeRecipe); setAssistantQuery("Research and verify any missing prep time, cook time, servings, equipment, difficulty, nutrition, or useful cooking cues for this recipe."); }}>Ask Kiku</button></article>
                  ) : null}
                  </div>
                  {(activeRecipe.recipe.substitutions || []).length > 0 && (
                    <div className="recipe-substitution-block">
                      <span className="recipe-section-kicker">SUBSTITUTIONS</span>
                      <div className="recipe-substitution-list">
                        {activeRecipe.recipe.substitutions.map((item) => <div key={`${item.ingredient}-${item.substitute}`}><strong>{item.ingredient}</strong><span>→ {item.substitute}</span>{item.note ? <p>{item.note}</p> : null}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeRecipe.recipe.provenance?.sources?.length ? (
                <div className="recipe-source-note">
                  <span>Recipe data checked against {activeRecipe.recipe.provenance.sources.length} source{activeRecipe.recipe.provenance.sources.length === 1 ? "" : "s"}.</span>
                  {activeRecipe.recipe.sourceUrl ? <a href={activeRecipe.recipe.sourceUrl} target="_blank" rel="noreferrer">View source</a> : null}
                </div>
              ) : null}

              <div className="recipe-bottom-actions">
                <button type="button" className="recipe-save-button" onClick={() => toggleRecipeSaved(activeRecipe.dish.name)}>
                  {savedRecipes.has(activeRecipe.dish.name) ? "♥ Saved Recipe" : "♡ Save Recipe"}
                </button>
                <button type="button" className="recipe-start-button" onClick={() => startCooking(0)} disabled={!activeRecipe.recipe.steps?.length}>
                  {activeRecipe.recipe.steps?.length ? "Start Cooking" : "Steps unavailable"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCooking && (
        <div className="kiku-fullpage-backdrop cooking-backdrop" role="presentation">
          <div className={`cooking-page ${activeCooking.recipe.accentClass || "recipe-accent-rose"}`} role="dialog" aria-modal="true" aria-labelledby="cooking-title">
            <div
              className="cooking-background"
              aria-hidden="true"
              style={activeCooking.recipe.image ? { backgroundImage: `linear-gradient(180deg, rgba(12,7,9,.34) 0%, rgba(28,8,15,.72) 68%, rgba(29,8,15,.96) 100%), url("${activeCooking.recipe.image}")` } : undefined}
            >
              <div className="cooking-background-art">{activeCooking.recipe.emoji || activeCooking.dish?.art || "🍽️"}</div>
            </div>
            <div className="cooking-topbar">
              <button type="button" className="cooking-icon-button cooking-back-button" onClick={backToRecipeFromCooking} aria-label="Back to recipe">‹</button>
              <div className="cooking-topbar-center">
                <span>KITCHEN MODE</span>
                <strong>{activeCooking.dish?.name || "Kiku recipe"}</strong>
              </div>
              <button type="button" className="cooking-icon-button cooking-exit-button" onClick={closeCooking} aria-label="Exit cooking mode">×</button>
            </div>

            <div className="cooking-content" ref={cookingStepRef}>
              <div className="cooking-context-row">
                <span className="cooking-step-count">Step {cookingStep + 1} of {activeCooking.recipe.steps.length}</span>
                <span className="cooking-serving-pill">{activeCooking.servingCount > 0 ? `${activeCooking.servingCount} servings` : "Serving size unspecified"}</span>
                {activeCooking.recipe.provenance?.enrichment === "user-substitution" ? <span className="cooking-variant-pill">Modified recipe</span> : null}
              </div>

              <div className="cooking-step-heading">
                <span>{activeCooking.recipe.steps[cookingStep].name}</span>
                <h1 id="cooking-title">{activeCooking.recipe.steps[cookingStep].instruction}</h1>
              </div>

              <div className="cooking-step-meta">
                {activeCooking.recipe.steps[cookingStep].heat ? <span>🔥 {activeCooking.recipe.steps[cookingStep].heat}</span> : null}
                {activeCooking.recipe.steps[cookingStep].duration ? <span>⏱ {formatTimer(activeCooking.recipe.steps[cookingStep].duration)}</span> : null}
                {(activeCooking.recipe.steps[cookingStep].equipment || []).slice(0, 2).map((item) => <span key={item}>▢ {item}</span>)}
              </div>

              <div className="cooking-workspace">
                <section className="cooking-step-ingredients" aria-label="Ingredients for this step">
                  <div className="cooking-panel-heading">
                    <div><span>THIS STEP</span><strong>What you'll use now</strong></div>
                    <small>{getCookingIngredientState().length} items</small>
                  </div>
                  {getCookingIngredientState().length > 0 ? (
                    <div className="cooking-step-ingredient-list">
                      {getCookingIngredientState().map((item) => (
                        <div className="cooking-step-ingredient" key={item.name}>
                          <span className="cooking-step-ingredient-check">✓</span>
                          <span>{item.name}</span>
                          <strong>{item.amount}</strong>
                          <button
                            type="button"
                            className="ingredient-swap-button cooking-ingredient-swap"
                            onClick={() => openSubstitutionModal(item.name, activeCooking)}
                            aria-label={`Swap ${item.name} in this recipe`}
                          >
                            Swap
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="cooking-no-ingredients">This step does not explicitly name an ingredient. Check the instruction text above before proceeding.</div>
                  )}
                  {getCookingRemainingIngredients().length > 0 ? (
                    <details className="cooking-remaining-details">
                      <summary>{getCookingRemainingIngredients().length} ingredients still to come</summary>
                      <div>{getCookingRemainingIngredients().map((item) => <span key={item.name}>{item.name} · {item.amount}</span>)}</div>
                    </details>
                  ) : null}
                </section>

                <section className={`cooking-timer-card ${activeCooking.recipe.steps[cookingStep].duration ? "has-step-timer" : "no-step-timer"}`} aria-label="Step timer">
                  {activeCooking.recipe.steps[cookingStep].duration ? (
                    <>
                      <span className="cooking-timer-label">STEP TIMER</span>
                      <button className={`cooking-timer ${timerRunning ? "running" : ""}`} type="button" onClick={toggleCurrentTimer} aria-label={timerRunning ? "Pause timer" : timerRemaining > 0 && timerRemaining < activeCooking.recipe.steps[cookingStep].duration ? "Resume timer" : "Start timer"}>
                        <span>{formatTimer(timerRemaining || activeCooking.recipe.steps[cookingStep].duration)}</span>
                        <strong>{timerRunning ? "Pause" : timerRemaining > 0 && timerRemaining < activeCooking.recipe.steps[cookingStep].duration ? "Resume" : "Start timer"}</strong>
                      </button>
                      <button type="button" className="cooking-reset-timer" onClick={resetCurrentTimer}>Reset timer</button>
                    </>
                  ) : (
                    <div className="cooking-no-timer-card"><span>✓</span><strong>No timer needed</strong><p>Move on when the food reaches the cue below.</p></div>
                  )}
                </section>
              </div>

              <section className="cooking-cue-card">
                <span className="cooking-cue-icon">◌</span>
                <div><strong>Look for</strong><p>{activeCooking.recipe.steps[cookingStep].cue || activeCooking.recipe.steps[cookingStep].tip}</p></div>
              </section>

              <section className="cooking-tip">
                <span className="cooking-tip-icon">♡</span>
                <div><strong>Pro Tip</strong><p>{activeCooking.recipe.steps[cookingStep].tip}</p></div>
              </section>

              <div className="cooking-help-row">
                <button type="button" onClick={() => { openAssistant(activeCooking); setAssistantQuery(`I am cooking ${activeCooking.dish?.name || "this recipe"}, step ${cookingStep + 1}: ${activeCooking.recipe.steps[cookingStep].instruction}. Help me with this step.`); }}>
                  <span>✿</span> Ask Kiku about this step
                </button>
              </div>

              <div className="cooking-navigation">
                <button type="button" onClick={previousCookingStep} disabled={cookingStep === 0}><span>←</span><small>Previous</small></button>
                <button type="button" className="cooking-next-button" onClick={nextCookingStep}><span>→</span><small>{cookingStep === activeCooking.recipe.steps.length - 1 ? "Finish" : "Next step"}</small></button>
              </div>

              <div className="cooking-progress" aria-label="Recipe progress">
                {activeCooking.recipe.steps.map((step, index) => (
                  <button type="button" key={`${step.name}-${index}`} ref={(el) => { cookingProgressItemRefs.current[index] = el; }} className={`cooking-progress-item ${index < cookingStep ? "done" : index === cookingStep ? "current" : ""}`} onClick={() => goToCookingStep(index)}>
                    <span>{index < cookingStep ? "✓" : index + 1}</span><small>{step.name}</small>
                  </button>
                ))}
              </div>
            </div>

            {stepCompletePopup && (
              <div className="step-complete-popup" role="dialog" aria-modal="true" aria-labelledby="step-complete-title">
                <div className="step-complete-card">
                  <span className="step-complete-check">✓</span>
                  <strong id="step-complete-title">Timer finished</strong>
                  <p>Check the food before continuing. Cooking times are guides, so texture and colour are the final cues.</p>
                  <div className="step-complete-actions">
                    <button type="button" className="step-complete-secondary" onClick={() => setStepCompletePopup(false)}>Keep this step</button>
                    <button type="button" className="step-complete-primary" onClick={() => { setStepCompletePopup(false); nextCookingStep(); }}>Continue to next step</button>
                  </div>
                  <button type="button" className="step-complete-close" onClick={() => setStepCompletePopup(false)} aria-label="Close timer message">×</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {assistantOpen && (
        <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label="Kiku Assistant" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssistant(); }}>
          <div className="assistant-modal">
            <div className="assistant-modal-header">
              <div className="assistant-brand"><div className="assistant-avatar" aria-hidden="true">✿</div><div><strong>Kiku</strong><span>Food for every mood.</span></div></div>
              <div className="assistant-modal-actions"><button type="button" className="assistant-icon-button" onClick={closeAssistant} aria-label="Close assistant">×</button></div>
            </div>

            <div className="assistant-message assistant-message-bot">Hi! I’m Kiku. Ask me about food, recipes, restaurants, or price comparisons.</div>
            {assistantMessages.map((message, index) => (
              <div key={`${message.role}-${index}`}>
                <div className={`assistant-message ${message.role === "user" ? "assistant-message-user" : "assistant-message-bot"}`}>{message.content}</div>
                {(message.data?.type === "recipe_substitution" || message.data?.type === "recipe_enrichment") && message.data.recipeVariant && (
                  <div className="assistant-recipe-variant-card">
                    <div>
                      <span className="assistant-recipe-variant-kicker">{message.data.type === "recipe_substitution" ? "RECIPE CHANGE" : "RECIPE RESEARCH"}</span>
                      <strong>{message.data.summary || (message.data.type === "recipe_substitution" ? "Kiku prepared a recipe substitution." : "Kiku prepared an updated recipe with researched details.")}</strong>
                      {message.data.warning ? <p>{message.data.warning}</p> : null}
                      {message.data.sources?.length ? <p>{message.data.sources.length} source{message.data.sources.length === 1 ? "" : "s"} checked.</p> : null}
                    </div>
                    <button type="button" onClick={() => applyRecipeVariant(message.data.recipeVariant)}>Apply to current recipe</button>
                  </div>
                )}

                {message.data?.type === "recipe_substitution_error" && (
                  <div className="assistant-recipe-error">Kiku could not apply that substitution to the current recipe.</div>
                )}

                {((message.data?.type === "recommendations" && Array.isArray(message.data.recommendations)) ||
                  (message.data?.type === "recipe_options" && Array.isArray(message.data.dishes))) && (
                  <div className="assistant-dish-grid">
                    {(message.data.recommendations || message.data.dishes || []).map((entry, entryIndex) => {
                      const dish = normalizeCatalogDish(entry?.dish || entry);
                      const listingUrl = getAssistantExternalUrl(dish);
                      const card = (
                        <>
                          <div className={`assistant-dish-art ${dish.artClass || ""}`}>
                            {dish.image ? <img src={dish.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{dish.art}</span>}
                          </div>
                          <div className="assistant-dish-copy">
                            <strong>{dish.name}</strong>
                            <span>{dish.restaurant || dish.descriptor || "Kiku recommendation"}</span>
                            <b>{dish.price}</b>
                            {listingUrl ? <span className="assistant-external-link">View original listing ↗</span> : <span className="assistant-card-link-hint">Open in Kiku</span>}
                          </div>
                        </>
                      );
                      return listingUrl
                        ? <a key={`${dish.name || "dish"}-${entryIndex}`} href={listingUrl} target="_blank" rel="noopener noreferrer" className="assistant-dish-card assistant-linked-card">{card}</a>
                        : <button key={`${dish.name || "dish"}-${entryIndex}`} type="button" className="assistant-dish-card" onClick={() => { closeAssistant(); openDish(dish); }}>{card}</button>;
                    })}
                  </div>
                )}

                {((message.data?.type === "recipes" && Array.isArray(message.data.recipes)) ||
                  (message.data?.type === "recipe_options" && Array.isArray(message.data.recipes))) && (
                  <div className="assistant-recipe-grid">
                    {(message.data.recipes || []).map((recipe, recipeIndex) => {
                      const sourceUrl = getAssistantRecipeUrl(recipe);
                      const title = recipe?.title || "Recipe";
                      const image = recipe?.image || recipe?.details?.image || "";
                      const recipeCard = (
                        <div className="assistant-recipe-card">
                          <div className="assistant-recipe-card-image">
                            {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🍽️</span>}
                          </div>
                          <div className="assistant-recipe-card-copy">
                            <span className="assistant-recipe-card-kicker">RECIPE</span>
                            <strong>{title}</strong>
                            <span>{recipe?.cuisine || recipe?.description || "Recipe provider listing"}</span>
                            {recipe?.time ? <b>{recipe.time}</b> : null}
                            {sourceUrl ? <span className="assistant-external-link">View original recipe ↗</span> : <span className="assistant-card-link-hint">Open recipe details</span>}
                          </div>
                        </div>
                      );
                      return sourceUrl
                        ? <a key={`${title}-${recipeIndex}`} href={sourceUrl} target="_blank" rel="noopener noreferrer" className="assistant-recipe-link-card">{recipeCard}</a>
                        : <button key={`${title}-${recipeIndex}`} type="button" className="assistant-recipe-button-card" onClick={() => { closeAssistant(); void openRecipeFromFeed(recipe); }}>{recipeCard}</button>;
                    })}
                  </div>
                )}
              </div>
            ))}

            {!isLoggedIn && assistantMatches.length > 0 && (
              <div className="assistant-recommendation-block">
                <div className="assistant-message assistant-message-bot">Sign in to make Kiku's answers use your saved preferences and history.</div>
                <div className="assistant-dish-grid">
                  {assistantMatches.map((dish) => (
                    <button key={dish.name} type="button" className="assistant-dish-card" onClick={() => { closeAssistant(); openDish(dish); }}>
                      <div className={`assistant-dish-art ${dish.artClass || ""}`}><span>{dish.art}</span></div>
                      <div className="assistant-dish-copy"><strong>{dish.name}</strong><span>{dish.restaurant}</span><b>{dish.price}</b></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="assistant-suggestions"><div className="assistant-suggestions-heading">Try these <span aria-hidden="true">›</span></div><div className="assistant-tags">{["Comfort food", "Healthy", "Budget friendly", "Surprise me"].map((tag) => <button type="button" key={tag} onClick={() => setAssistantQuery(tag === "Surprise me" ? "" : tag)}>{tag}</button>)}</div></div>

            <form className="assistant-input-row" onSubmit={submitAssistant}>
              <input value={assistantQuery} onChange={(event) => setAssistantQuery(event.target.value)} placeholder={isLoggedIn ? "Ask Kiku anything about food…" : "Tell me what you're craving…"} aria-label="Ask Kiku" />
              <button type="submit" aria-label="Ask Kiku" disabled={assistantBusy}>{assistantBusy ? "…" : "→"}</button>
            </form>
          </div>
        </div>
      )}

      {recipeSubstitutionModal && (
        <div className="recipe-substitution-modal-backdrop" role="presentation">
          <div className="recipe-substitution-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-substitution-title">
            <button type="button" className="recipe-substitution-close" onClick={() => setRecipeSubstitutionModal(null)} aria-label="Close ingredient substitution dialog">×</button>
            <span className="recipe-section-kicker">CHANGE INGREDIENT</span>
            <h2 id="recipe-substitution-title">Swap {recipeSubstitutionModal.ingredient}</h2>
            <p>Tell Kiku what you have instead. It will update the affected ingredients and method steps without changing unrelated parts of the recipe.</p>
            <form onSubmit={submitRecipeSubstitution}>
              <label>
                Substitute with
                <input autoFocus value={recipeSubstitutionText} onChange={(event) => setRecipeSubstitutionText(event.target.value)} placeholder="e.g. coconut milk" maxLength={160} />
              </label>
              {recipeSubstitutionError ? <div className="recipe-substitution-error" role="alert">{recipeSubstitutionError}</div> : null}
              <div className="recipe-substitution-actions">
                <button type="button" className="recipe-save-button" onClick={() => setRecipeSubstitutionModal(null)}>Cancel</button>
                <button type="submit" className="recipe-start-button" disabled={!recipeSubstitutionText.trim() || recipeSubstitutionBusy}>{recipeSubstitutionBusy ? "Updating…" : "Apply substitution"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PincodeDialog
        open={pincodeOpen}
        currentPincode={pincode}
        forced={!isLoggedIn && !pincode && !pincodePromptSeen}
        onSaved={(saved) => { setPincode(saved); setPincodeOpen(false); setPincodePromptSeen(true); }}
        onSkip={() => { dismissKikuPincodePrompt(); setPincodePromptSeen(true); setPincodeOpen(false); }}
        onClose={() => setPincodeOpen(false)}
      />

      <nav className="mobile-bottom-nav" aria-label="Mobile bottom navigation">
        {mobileNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`mobile-bottom-item ${isNavItemActive(item) ? "active" : ""}`}
            onClick={() => {
              if (item.label === "Search") focusDishSearch();
              else if (item.label === "Assistant") openAssistant();
              else if (item.label === "Profile") openProfile();
              else scrollToSection(item.target);
            }}
          >
            <span className="mobile-bottom-icon" aria-hidden="true">
              <item.Icon />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}