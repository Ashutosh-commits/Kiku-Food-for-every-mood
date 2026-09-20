import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import ProfilePage from "./pages/profile/Profile";
import LoginPage from "./pages/auth/Login";
import SignupPage from "./pages/auth/Signup";
import PincodeDialog from "./components/location/PincodeDialog";
import { getKikuPincode, hasDismissedKikuPincodePrompt, dismissKikuPincodePrompt } from "./stores/location-store";
import {
  getKikuPreferences,
  getKikuSavedItems,
  toggleKikuSavedDish,
  toggleKikuSavedRecipe,
  scoreKikuDish,
} from "./stores/profile-store";

import { moods, discoveryDishes, recommendationSets, moodQuotes } from "./data/dishes";
import { cravingOptions, prepTimeOptions, budgetOptions } from "./data/filters";
import { recipeApiUrl, fallbackRecipes, normalizeRecipe, getRecipeForDish } from "./data/recipes";
import { shuffleArray, runMoodPrediction } from "./data/helpers";
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
import { scrollToSection, getStandaloneRoute } from "./utils/navigation";

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

export default function App() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kiku-theme") === "dark";
  });
  const [activeSection, setActiveSection] = useState("home");
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kiku-authenticated") === "true";
  });
  const [profileRoute, setProfileRoute] = useState(() => (
    typeof window !== "undefined" && (window.location.hash === "#profile" || window.location.hash.startsWith("#profile/"))
  ));
  const [authRoute, setAuthRoute] = useState(() => getStandaloneRoute());

  useEffect(() => {
    const syncAuthRoute = () => setAuthRoute(getStandaloneRoute());
    window.addEventListener("popstate", syncAuthRoute);
    window.addEventListener("hashchange", syncAuthRoute);
    return () => {
      window.removeEventListener("popstate", syncAuthRoute);
      window.removeEventListener("hashchange", syncAuthRoute);
    };
  }, []);
  const [pincode, setPincode] = useState(() => getKikuPincode());
  const [pincodeOpen, setPincodeOpen] = useState(false);
  const [pincodePromptSeen, setPincodePromptSeen] = useState(() => hasDismissedKikuPincodePrompt());
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [carouselScrollLeft, setCarouselScrollLeft] = useState(0);
  const [carouselCanScrollRight, setCarouselCanScrollRight] = useState(true);
  const [activeDish, setActiveDish] = useState(null);
  const [activeRestaurant, setActiveRestaurant] = useState(null);
  const [dishHistory, setDishHistory] = useState([]);
  const [dishReturnRestaurant, setDishReturnRestaurant] = useState(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");  const [workflowStep, setWorkflowStep] = useState(0);

  const [likedDishes, setLikedDishes] = useState(() => new Set(getKikuSavedItems().dishes.map((item) => item.name)));
  const [likedRestaurants, setLikedRestaurants] = useState(() => new Set());
  const [similarScrollLeft, setSimilarScrollLeft] = useState(0);
  const [similarCanScrollRight, setSimilarCanScrollRight] = useState(false);
  const [moodStage, setMoodStage] = useState("scan"); // "scan" | "result"
  const [scanStatus, setScanStatus] = useState("idle"); // idle | requesting | scanning | denied
  const [detectedMood, setDetectedMood] = useState(null); // { mood, confidence } — set at runtime only
  const [craving, setCraving] = useState(null);
  const [prepTime, setPrepTime] = useState(null);
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
  const [ingredientQuantities, setIngredientQuantities] = useState({});
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
  const similarRailRef = useRef(null);  const workflowStepRefs = useRef([]);
  const moodVideoRef = useRef(null);
  const moodStreamRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const completionTimeoutRef = useRef(null);
  const cookingStepRef = useRef(null);
  const cookingProgressItemRefs = useRef([]);
  const profileReturnScrollRef = useRef(0);


  useEffect(() => {
    document.documentElement.classList.toggle("kiku-dark", darkMode);
    localStorage.setItem("kiku-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const syncAuth = () => {
      setIsLoggedIn(localStorage.getItem("kiku-authenticated") === "true");
    };
    const onAuthChange = (event) => {
      if (typeof event?.detail?.authenticated === "boolean") {
        setIsLoggedIn(event.detail.authenticated);
      } else {
        syncAuth();
      }
    };

    window.addEventListener("storage", syncAuth);
    window.addEventListener("kiku-auth-change", onAuthChange);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("kiku-auth-change", onAuthChange);
    };
  }, []);

  useEffect(() => {
    const syncStoredKikuData = () => {
      const saved = getKikuSavedItems();
      setLikedDishes(new Set((saved.dishes || []).map((item) => item.name)));
      setSavedRecipes(new Set((saved.recipes || []).map((item) => item.name)));
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

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    let activeController: AbortController | null = null;

    const loadRecipes = async () => {
      if (cancelled || loading) return;
      loading = true;
      activeController?.abort();
      activeController = new AbortController();
      const timeoutId = window.setTimeout(() => activeController?.abort(), 8000);
      setRecipesLoading(true);
      setRecipesError("");

      try {
        const response = await fetch(recipeApiUrl, {
          headers: { Accept: "application/json" },
          cache: "no-cache",
          signal: activeController.signal,
        });

        if (!response.ok) {
          throw new Error(`Recipe feed returned ${response.status}.`);
        }

        const payload = await response.json();
        const source = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.recipes)
            ? payload.recipes
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

        const normalized = source
          .map(normalizeRecipe)
          .filter((recipe) => recipe.title && recipe.title !== "Untitled recipe");

        if (!cancelled) {
          // Prefer live scraper/API data. Fall back to six existing Kiku
          // recipes only when the live feed has nothing usable.
          setRecipes(shuffleArray(normalized.length ? normalized : fallbackRecipes));
          setRecipesLoading(false);
        }
      } catch (error) {
        if (!cancelled && error?.name !== "AbortError") {
          // Keep the page useful while the scraper/API is offline. The API
          // remains the primary source and will take over automatically once it responds.
          setRecipes(shuffleArray(fallbackRecipes));
          setRecipesLoading(false);
          setRecipesError("");
        }
      } finally {
        window.clearTimeout(timeoutId);
        loading = false;
      }
    };

    loadRecipes();
    const interval = window.setInterval(loadRecipes, 5 * 60 * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") loadRecipes();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
    const scoreList = (dishes) => dishes
      .map((dish, index) => ({ dish, score: scoreKikuDish(dish, preferences).score - index * 0.001 }))
      .filter((entry) => scoreKikuDish(entry.dish, preferences).allowed)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.dish);

    if (!hasRecommendationData) {
      const offset = shuffleSeed % discoveryDishes.length;
      const rotated = [...discoveryDishes.slice(offset), ...discoveryDishes.slice(0, offset)];
      return scoreList(rotated).slice(0, 6);
    }

    const wanted = recommendationSets[selectedMood] || recommendationSets.Calm;
    return scoreList(wanted.map((name) => discoveryDishes.find((dish) => dish.name === name)).filter(Boolean));
  }, [hasRecommendationData, selectedMood, shuffleSeed, preferenceVersion]);

  const discoverTitle = hasRecommendationData ? "Recommendations" : "Discover";
  const discoverHeadline = hasRecommendationData ? "Made for this moment" : "Find something that feels right";
  const discoverDescription = hasRecommendationData
    ? `Based on your ${selectedMood.toLowerCase()} expression signal and the choices you've made in Kiku.`
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
      clearTimeout(completionTimeoutRef.current);
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

  const openDish = (dish: Dish, options: { fromRestaurant?: unknown; pushHistory?: boolean } = {}) => {
    const { fromRestaurant = null, pushHistory = true } = options;
    setDishHistory((history) => {
      if (!activeDish || !pushHistory) return history;
      return [...history, activeDish].slice(-8);
    });
    if (fromRestaurant) setDishReturnRestaurant(fromRestaurant);
    setActiveRestaurant(null);
    setActiveDish(dish);
  };

  const openRestaurant = (restaurant) => {
    setDishHistory([]);
    setDishReturnRestaurant(null);
    setActiveDish(null);
    setVegOnly(false);
    setRestaurantSearch("");
    setActiveRestaurant(restaurant);
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

  const focusDishSearch = () => {
    setActiveSection("search");
    document.getElementById("discover-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => dishSearchInputRef.current?.focus(), 420);
  };

  const openAssistant = () => {
    setAssistantOpen(true);
  };

  const closeAssistant = () => {
    setAssistantOpen(false);
    setAssistantQuery("");
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
  }, [assistantQuery, preferenceVersion, selectedMood]);

  const navigateAuth = (route, returnTo = "home") => {
    sessionStorage.setItem("kiku-auth-return", returnTo);
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

  const handleAuthSuccess = () => {
    setIsLoggedIn(true);
    setAuthRoute(null);
    const returnTo = sessionStorage.getItem("kiku-auth-return") || "home";
    sessionStorage.removeItem("kiku-auth-return");
    window.history.replaceState(null, "", window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/signup") ? "/" : window.location.pathname);
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: true } }));
    if (returnTo === "profile") {
      window.location.hash = "profile";
      setProfileRoute(true);
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.hash = "";
      requestAnimationFrame(() => window.scrollTo({ top: profileReturnScrollRef.current || 0, behavior: "auto" }));
    }
  };

  const handleSkipAuth = () => {
    sessionStorage.removeItem("kiku-auth-return");
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

  const handleProfileSignOut = () => {
    localStorage.removeItem("kiku-authenticated");
    setIsLoggedIn(false);
    window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: false } }));
    closeProfile();
  };

  const openRecipe = (dish) => {
    setActiveSection("recipes");
    const recipe = getRecipeForDish(dish);
    setActiveDish(null);
    setActiveRestaurant(null);
    setActiveCooking(null);
    setActiveRecipe({ dish, recipe });
    setRecipeTab("Ingredients");
    setCookingStep(0);
    setTimerRemaining(recipe.steps[0]?.duration || 0);
    setTimerRunning(false);

    setIngredientQuantities(
      Object.fromEntries(recipe.ingredients.map(([, amount], index) => [index, 1]))
    );
  };

  // Adapts a live recipe-feed item (title/description/cuisine) to the
  // { name, descriptor, restaurant, rating, time } shape openRecipe expects,
  // so the "View recipe" button on the recipes-grid card can reuse the same
  // Recipe Page / Cooking Mode flow as the "Cook" button on a dish card.
  const openRecipeFromFeed = (recipe) => {
    openRecipe({
      name: recipe.title,
      descriptor: recipe.description || recipe.title,
      restaurant: recipe.cuisine || "Kiku's kitchen",
      rating: "4.7",
      time: recipe.time || "30 minutes",
    });
  };

  const closeRecipe = () => {
    setActiveRecipe(null);
    setTimerRunning(false);
    setActiveSection("recipes");
  };

  const startCooking = () => {
    if (!activeRecipe) return;
    const firstStep = 0;
    const recipe = activeRecipe.recipe;
    clearInterval(timerIntervalRef.current);
    clearTimeout(completionTimeoutRef.current);
    setActiveCooking({
      dish: activeRecipe.dish,
      recipe,
      returnRecipe: activeRecipe,
      returnDish: activeRecipe.dish,
    });
    setActiveRecipe(null);
    setCookingStep(firstStep);
    setTimerRemaining(recipe.steps[firstStep]?.duration || 0);
    setTimerRunning(false);
    setStepCompletePopup(false);
  };

  const closeCooking = () => {
    clearInterval(timerIntervalRef.current);
    clearTimeout(completionTimeoutRef.current);
    setTimerRunning(false);
    setStepCompletePopup(false);
    setActiveCooking(null);
  };

  const backToRecipeFromCooking = () => {
    if (!activeCooking?.returnRecipe) {
      closeCooking();
      return;
    }

    clearInterval(timerIntervalRef.current);
    clearTimeout(completionTimeoutRef.current);
    setTimerRunning(false);
    setStepCompletePopup(false);
    setActiveCooking(null);
    setActiveRecipe(activeCooking.returnRecipe);
  };

  const goToCookingStep = (index) => {
    if (!activeCooking) return;
    const nextIndex = Math.max(0, Math.min(index, activeCooking.recipe.steps.length - 1));
    clearInterval(timerIntervalRef.current);
    clearTimeout(completionTimeoutRef.current);
    setStepCompletePopup(false);
    setTimerRunning(false);
    setCookingStep(nextIndex);
    setTimerRemaining(activeCooking.recipe.steps[nextIndex]?.duration || 0);
    requestAnimationFrame(() => {
      cookingStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const nextCookingStep = () => {
    if (!activeCooking) return;
    if (cookingStep >= activeCooking.recipe.steps.length - 1) {
      closeCooking();
      return;
    }
    goToCookingStep(cookingStep + 1);
  };

  const previousCookingStep = () => {
    goToCookingStep(cookingStep - 1);
  };

  const toggleRecipeSaved = (dishName) => {
    const dish = discoveryDishes.find((item) => item.name === dishName) || (activeRecipe?.dish?.name === dishName ? activeRecipe.dish : null);
    const recipe = dish ? getRecipeForDish(dish) : null;
    const savedRecipe = {
      name: dishName,
      description: recipe?.description || dish?.descriptor || "Kiku recipe",
      time: recipe?.time || dish?.time || "30 min",
      cuisine: recipe?.cuisine || dish?.restaurantMeta?.split(" • ")[0] || dish?.restaurant || "Kiku kitchen",
      rating: recipe?.rating || dish?.rating || "4.7",
    };
    toggleKikuSavedRecipe(savedRecipe);
    setSavedRecipes(new Set(getKikuSavedItems().recipes.map((item) => item.name)));
  };

  const adjustIngredient = (index, delta) => {
    setIngredientQuantities((current) => ({
      ...current,
      [index]: Math.max(0, (current[index] || 1) + delta),
    }));
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.max(0, seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const getCookingIngredientState = () => {
    if (!activeCooking) return [];
    const ingredients = activeCooking.recipe.ingredients || [];
    const steps = activeCooking.recipe.steps || [];
    const currentIngredients = new Set(steps[cookingStep]?.ingredients || []);
    const usedIngredients = new Set();

    steps.slice(0, cookingStep).forEach((step) => {
      (step.ingredients || []).forEach((ingredient) => usedIngredients.add(ingredient));
    });

    return ingredients.map(([name, amount]) => ({
      name,
      amount,
      current: currentIngredients.has(name),
      used: usedIngredients.has(name) && !currentIngredients.has(name),
    }));
  };

  const startCurrentTimer = () => {
    if (!activeCooking) return;
    const duration = activeCooking.recipe.steps[cookingStep]?.duration || 0;
    if (!duration || timerRunning) return;

    setTimerRemaining((current) => current || duration);
    setTimerRunning(true);

    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      setTimerRemaining((current) => {
        if (current <= 1) {
          clearInterval(timerIntervalRef.current);
          setTimerRunning(false);
          setStepCompletePopup(true);

          clearTimeout(completionTimeoutRef.current);
          completionTimeoutRef.current = window.setTimeout(() => {
            setStepCompletePopup(false);
            nextCookingStep();
          }, 8000);

          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const closeRestaurant = () => {
    setVegOnly(false);
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
    setLikedRestaurants((current) => {
      const next = new Set(current);
      if (next.has(restaurantName)) next.delete(restaurantName);
      else next.add(restaurantName);
      return next;
    });
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
  }, []);

  const similarDishes = useMemo(() => {
    if (!activeDish) return [];
    return discoveryDishes.filter((dish) => dish.name !== activeDish.name).slice(0, 8);
  }, [activeDish]);

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return discoveryDishes
      .filter((dish) =>
        [dish.name, dish.restaurant, dish.descriptor, ...(dish.tags || [])]
          .some((value) => value.toLowerCase().includes(query))
      )
      .slice(0, 5);
  }, [searchQuery]);

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
    requestAnimationFrame(() => scrollToSection("discover"));
  };

  const stopMoodStream = () => {
    moodStreamRef.current?.getTracks().forEach((track) => track.stop());
    moodStreamRef.current = null;
    if (moodVideoRef.current) moodVideoRef.current.srcObject = null;
  };

  const finishScan = () => {
    const prediction = runMoodPrediction();
    setDetectedMood(prediction);
    stopMoodStream();
    setScanStatus("idle");
    setMoodStage("result");
  };

  const startMoodScan = async (facingMode = "user") => {
    window.clearTimeout(scanTimeoutRef.current);
    setScanStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      moodStreamRef.current = stream;
      if (moodVideoRef.current) {
        moodVideoRef.current.srcObject = stream;
        await moodVideoRef.current.play().catch(() => {});
      }
      setScanStatus("scanning");
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
  };

  const retakeMoodScan = () => {
    window.clearTimeout(scanTimeoutRef.current);
    stopMoodStream();
    setScanStatus("idle");
    setDetectedMood(null);
    setCraving(null);
    setPrepTime(null);
    setBudget(null);
    setMoodStage("scan");
  };

  const findMoodFood = () => {
    if (detectedMood?.mood) chooseMood(detectedMood.mood);
    else scrollToSection("discover");
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(scanTimeoutRef.current);
      stopMoodStream();
    };
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

  if (authRoute === "login") {
    return (
      <LoginPage
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onSuccess={handleAuthSuccess}
        onSignup={() => navigateAuth("signup", sessionStorage.getItem("kiku-auth-return") || "home")}
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
        onLogin={() => navigateAuth("login", sessionStorage.getItem("kiku-auth-return") || "home")}
        onSkip={handleSkipAuth}
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
        onDeleted={() => {
          setIsLoggedIn(false);
          setLikedDishes(new Set());
          setSavedRecipes(new Set());
          closeProfile();
        }}
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

          {!isLoggedIn && (
            <button className="sign-in" type="button" onClick={handleSignIn}>
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
              <button className="primary-button" type="button" onClick={() => scrollToSection("mood")}>
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
              {['All', 'Order Online', 'Cook at Home', 'Healthy', 'Quick'].map((filter, index) => (
                <button key={filter} className={`discover-filter ${index === 0 ? "active" : ""}`} type="button">
                  {filter}
                </button>
              ))}
            </div>
            <button className="shuffle-button" type="button" onClick={() => setShuffleSeed((value) => value + 1)}>
              Shuffle
            </button>
          </div>

          <div className="dish-carousel-wrap">
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
                  <p className="kiku-search-empty">Try a dish, restaurant, cuisine, or mood.</p>
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
          }}
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
                  every dish it suggests, Kiku also checks prices, delivery fees and ETAs across
                  Swiggy and Zomato side-by-side, so you're not just eating something that matches
                  your mood, you're getting it at the better deal too.
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
                <h4>How much time do you have?</h4>
                <div className="kiku-mood-chips">
                  {prepTimeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`kiku-mood-chip ${prepTime === option ? "active" : ""}`}
                      onClick={() => setPrepTime(option)}
                      aria-pressed={prepTime === option}
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
            <p>
              Food for every mood. Discover dishes, compare prices, find recipes, and choose what fits your moment.
            </p>
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
            <button type="button" onClick={() => scrollToSection("recipes")}>Recipe ideas</button>
            <button type="button" onClick={() => scrollToSection("discover-search")}>Dish search</button>
            <button type="button" onClick={() => scrollToSection("mood")}>Mood scan</button>
          </div>

          <div className="kiku-footer-column">
            <span>YOUR JOURNEY</span>
            <p>Set your area</p>
            <p>Tell us the moment</p>
            <p>Explore nearby choices</p>
            <p>Compare the options</p>
            <p>Order or cook</p>
          </div>
        </div>

        <div className="kiku-footer-bottom">
          <div className="kiku-footer-credit-group">
            <span>© 2026 Kiku. Good food, thoughtfully found.</span>
            <a
              className="kiku-footer-portfolio"
              href="https://ashutosh-creates.ashutoshpundhir12.workers.dev/"
              target="_blank"
              rel="noreferrer"
            >
              Designed &amp; developed by Ashutosh Pundhir ↗
            </a>
          </div>
          <div className="kiku-footer-bottom-links">
            <button type="button">Privacy</button>
            <button type="button">Terms</button>
            <button type="button">Accessibility</button>
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
              {[
                ["Swiggy", activeDish.comparison.swiggy, "swiggy"],
                ["Zomato", activeDish.comparison.zomato, "zomato"],
              ].map(([provider, offer, className]) => (
                <div className={`dish-modal-provider ${className}`} key={provider}>
                  <div className="provider-heading">
                    <span className="provider-mark" aria-hidden="true">
                      {provider === "Swiggy" ? "S" : "z"}
                    </span>
                    <strong>{provider}</strong>
                  </div>

                  <div className="provider-price">{offer.item}</div>

                  <div className="provider-lines">
                    <div><span>Item Price</span><strong>{offer.item}</strong></div>
                    <div><span>Delivery Fee</span><strong>{offer.delivery}</strong></div>
                    <div><span>Platform Fee</span><strong>{offer.platform}</strong></div>
                  </div>

                  <div className="provider-total">
                    <span>Total</span>
                    <strong>{offer.total}</strong>
                  </div>

                  <div className="provider-eta">
                    <span>ETA</span>
                    <strong>◷ {offer.eta}</strong>
                  </div>

                  <button className="provider-order" type="button">
                    Order on {provider}
                  </button>
                </div>
              ))}
            </div>

            <div className="dish-modal-savings">
              <span aria-hidden="true">✓</span>
              <strong>
                You save ₹{Math.max(0, Number(activeDish.comparison.swiggy.total.replace("₹", "")) - Number(activeDish.comparison.zomato.total.replace("₹", "")))}
                {" "}on Zomato!
              </strong>
            </div>

            <div className="dish-modal-note">
              Prices are fetched in real-time and may vary.
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
                aria-label={vegOnly ? "Show all dishes" : "Show vegetarian dishes only"}
                aria-pressed={vegOnly}
                onClick={() => setVegOnly((value) => !value)}
                title={vegOnly ? "Show all dishes" : "Vegetarian only"}
              >
                <span className="veg-symbol" aria-hidden="true"><span /></span>
              </button>
            </div>

            <div className="restaurant-menu-list">
              {activeRestaurant.dishes
                .filter((dish) => !vegOnly || dish.tags.some((tag) => /vegetarian|veg/i.test(tag)))
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
                .filter((dish) => !vegOnly || dish.tags.some((tag) => /vegetarian|veg/i.test(tag)))
                .filter((dish) => {
                  const query = restaurantSearch.trim().toLowerCase();
                  if (!query) return true;
                  return [dish.name, dish.descriptor, ...dish.tags]
                    .join(" ")
                    .toLowerCase()
                    .includes(query);
                }).length === 0 && (
                  <div className="restaurant-empty-state">
                    {restaurantSearch.trim() ? "No dishes match your search." : "No vegetarian dishes are available in this sample menu."}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {activeRecipe && (
        <div className="kiku-fullpage-backdrop recipe-backdrop" role="presentation">
          <div className="recipe-page" role="dialog" aria-modal="true" aria-labelledby="recipe-page-title">
            <div className="recipe-hero">
              <img
                src={activeRecipe.dish.name === "Butter Chicken"
                  ? "/butter-chicken-hero.jpg"
                  : "/butter-chicken-hero.jpg"}
                alt=""
              />
              <div className="recipe-hero-actions">
                <button type="button" className="recipe-icon-button" onClick={closeRecipe} aria-label="Back">
                  &lt;
                </button>
                <span className="recipe-hero-spacer" />
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
                <div>
                  <h1 id="recipe-page-title">{activeRecipe.dish.name}</h1>
                  <div className="recipe-stat-row">
                    <span>☆ {activeRecipe.recipe.rating}</span>
                    <span>◷ {activeRecipe.recipe.time}</span>
                    <span>♧ {activeRecipe.recipe.servings}</span>
                  </div>
                </div>
                <div className="recipe-quick-actions">
                  <button type="button" aria-label="Chef mode">♨</button>
                  <button type="button" aria-label="Recipe video">▶</button>
                </div>
              </div>

              <p className="recipe-description">{activeRecipe.recipe.description}</p>

              <div className="recipe-tabs" role="tablist">
                {["Ingredients", "Steps", "Nutrition", "Tips"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={recipeTab === tab ? "active" : ""}
                    onClick={() => setRecipeTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {recipeTab === "Ingredients" && (
                <div className="recipe-ingredient-panel">
                  {activeRecipe.recipe.ingredients.map(([name, amount], index) => (
                    <div className="recipe-ingredient-row" key={name}>
                      <span>{name}</span>
                      <span className="ingredient-amount">{amount}</span>
                      <button type="button" onClick={() => adjustIngredient(index, -1)} aria-label={`Decrease ${name}`}>−</button>
                      <strong>{ingredientQuantities[index] || 1}</strong>
                      <button type="button" onClick={() => adjustIngredient(index, 1)} aria-label={`Increase ${name}`}>+</button>
                    </div>
                  ))}
                </div>
              )}

              {recipeTab === "Steps" && (
                <div className="recipe-info-panel">
                  {activeRecipe.recipe.steps.map((step, index) => (
                    <button key={step.name} type="button" onClick={() => setCookingStep(index)} className="recipe-step-row">
                      <span>{index + 1}</span>
                      <span><strong>{step.name}</strong>{step.instruction}</span>
                    </button>
                  ))}
                </div>
              )}

              {recipeTab === "Nutrition" && (
                <div className="recipe-info-panel recipe-nutrition">
                  <span><strong>Protein</strong><strong>32 g</strong></span>
                  <span><strong>Calories</strong><strong>520 kcal</strong></span>
                  <span><strong>Carbs</strong><strong>28 g</strong></span>
                  <span><strong>Fat</strong><strong>27 g</strong></span>
                </div>
              )}

              {recipeTab === "Tips" && (
                <div className="recipe-info-panel">
                  {activeRecipe.recipe.steps.slice(0, 4).map((step) => (
                    <p key={step.name}><strong>{step.name}:</strong> {step.tip}</p>
                  ))}
                </div>
              )}

              <div className="recipe-bottom-actions">
                <button
                  type="button"
                  className="recipe-save-button"
                  onClick={() => toggleRecipeSaved(activeRecipe.dish.name)}
                >
                  ♧ {savedRecipes.has(activeRecipe.dish.name) ? "Saved Recipe" : "Save Recipe"}
                </button>
                <button type="button" className="recipe-start-button" onClick={startCooking}>
                  Start Cooking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCooking && (
        <div className="kiku-fullpage-backdrop cooking-backdrop" role="presentation">
          <div className="cooking-page" role="dialog" aria-modal="true" aria-labelledby="cooking-title">
            <div className="cooking-background" aria-hidden="true" />
            <div className="cooking-topbar">
              <button
                type="button"
                className="cooking-icon-button cooking-back-button"
                onClick={backToRecipeFromCooking}
                aria-label="Back to recipe"
              >
                &lt;
              </button>

              <button
                type="button"
                className="cooking-icon-button cooking-exit-button"
                onClick={closeCooking}
                aria-label="Exit cooking mode"
              >
                ×
              </button>
            </div>

            <div
              className={`cooking-content ${
                activeCooking.recipe.steps[cookingStep]?.duration ? "has-timer" : "no-timer"
              }`}
              ref={cookingStepRef}
            >
              <span className="cooking-step-count">Step {cookingStep + 1} of {activeCooking.recipe.steps.length}</span>
              <h1 id="cooking-title">{activeCooking.recipe.steps[cookingStep].instruction}</h1>

              <div className="cooking-workspace">
                <div className="cooking-grocery-list" aria-label="Ingredients checklist">
                  <div className="cooking-grocery-head">
                    <div>
                      <span>GROCERY LIST</span>
                      <strong>Ingredients you need</strong>
                    </div>
                    <small>{getCookingIngredientState().filter((item) => !item.used).length} left</small>
                  </div>

                  <div className="cooking-grocery-items">
                    {getCookingIngredientState().map((item) => (
                      <div
                        className={`cooking-grocery-item ${
                          item.current ? "current" : ""
                        } ${item.used ? "used" : ""}`}
                        key={item.name}
                      >
                        <span className="cooking-grocery-check" aria-hidden="true">
                          {item.used ? "✓" : item.current ? "•" : ""}
                        </span>
                        <span className="cooking-grocery-name">{item.name}</span>
                        <span className="cooking-grocery-amount">{item.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className={`cooking-timer-area ${
                    activeCooking.recipe.steps[cookingStep].duration > 0 ? "has-step-timer" : "no-step-timer"
                  }`}
                >
                  {activeCooking.recipe.steps[cookingStep].duration > 0 && (
                    <button
                      className={`cooking-timer ${timerRunning ? "running" : ""}`}
                      type="button"
                      onClick={startCurrentTimer}
                      disabled={timerRunning}
                      aria-label={timerRunning ? "Timer running" : "Start timer"}
                    >
                      <span>{formatTimer(timerRemaining || activeCooking.recipe.steps[cookingStep].duration)}</span>
                      <strong>{timerRunning ? "Running" : "Start Timer"}</strong>
                    </button>
                  )}
                </div>
              </div>

              <div className="cooking-navigation">
                <button type="button" onClick={previousCookingStep} disabled={cookingStep === 0}>
                  <span>←</span>
                  <small>Previous</small>
                </button>

                <button type="button" onClick={nextCookingStep}>
                  <span>→</span>
                  <small>{cookingStep === activeCooking.recipe.steps.length - 1 ? "Finish" : "Next"}</small>
                </button>
              </div>

              <div className="cooking-tip">
                <span className="cooking-tip-icon">♡</span>
                <div>
                  <strong>Pro Tip</strong>
                  <p>{activeCooking.recipe.steps[cookingStep].tip}</p>
                </div>
              </div>

              <div className="cooking-progress">
                {activeCooking.recipe.steps.map((step, index) => (
                  <button
                    type="button"
                    key={step.name}
                    ref={(el) => {
                      cookingProgressItemRefs.current[index] = el;
                    }}
                    className={`cooking-progress-item ${
                      index < cookingStep ? "done" : index === cookingStep ? "current" : ""
                    }`}
                    onClick={() => goToCookingStep(index)}
                  >
                    <span>{index < cookingStep ? "✓" : index + 1}</span>
                    <small>{step.name}</small>
                  </button>
                ))}
              </div>
            </div>

            {stepCompletePopup && (
              <div className="step-complete-popup" role="status" aria-live="polite">
                <div className="step-complete-card">
                  <span className="step-complete-check">✓</span>
                  <strong>Step complete</strong>
                  <p>Nice work. Moving to the next step automatically.</p>
                  <button type="button" className="step-complete-close" onClick={() => setStepCompletePopup(false)} aria-label="Close completion message">×</button>
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
              <div className="assistant-brand">
                <div className="assistant-avatar" aria-hidden="true">✿</div>
                <div>
                  <strong>Kiku</strong>
                  <span>Food for every mood.</span>
                </div>
              </div>
              <div className="assistant-modal-actions">
                <button type="button" className="assistant-icon-button" onClick={closeAssistant} aria-label="Close assistant">×</button>
              </div>
            </div>

            <div className="assistant-message assistant-message-bot">Hi! I’m Kiku. What are you craving today?</div>
            {assistantMatches.length > 0 && (
              <div className="assistant-recommendation-block">
                <div className="assistant-message assistant-message-bot">{assistantQuery.trim() ? "Here are a few matches for you:" : "Here are a few ideas to start with:"}</div>
                <div className="assistant-dish-grid">
                  {assistantMatches.map((dish) => (
                    <button key={dish.name} type="button" className="assistant-dish-card" onClick={() => { closeAssistant(); openDish(dish); }}>
                      <div className={`assistant-dish-art ${dish.artClass || ""}`}><span>{dish.art}</span></div>
                      <div className="assistant-dish-copy">
                        <strong>{dish.name}</strong>
                        <span>{dish.restaurant}</span>
                        <b>{dish.price}</b>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="assistant-suggestions">
              <div className="assistant-suggestions-heading">Try these <span aria-hidden="true">›</span></div>
              <div className="assistant-tags">
                {["Comfort food", "Healthy", "Budget friendly", "Surprise me"].map((tag) => (
                  <button type="button" key={tag} onClick={() => setAssistantQuery(tag === "Surprise me" ? "" : tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <form className="assistant-input-row" onSubmit={(event) => event.preventDefault()}>
              <input
                value={assistantQuery}
                onChange={(event) => setAssistantQuery(event.target.value)}
                placeholder="Tell me what you're craving…"
                aria-label="Tell Kiku what you are craving"
              />
              <button type="submit" aria-label="Ask Kiku">→</button>
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