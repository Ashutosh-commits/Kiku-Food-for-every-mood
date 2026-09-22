import { api } from "../services/api";
import { isKikuAuthenticated } from "./profile-store";

const PIN_KEY = "kiku-pincode";
const PROMPT_KEY = "kiku-pincode-prompt-dismissed";
let currentPincode = "";

try { currentPincode = localStorage.getItem(PIN_KEY) || ""; } catch { currentPincode = ""; }

export const getKikuPincode = () => currentPincode;

export const setKikuPincodeFromServer = (pincode: string | null | undefined) => {
  currentPincode = pincode || "";
  try { if (currentPincode) localStorage.setItem(PIN_KEY, currentPincode); } catch { /* guest cache only */ }
  window.dispatchEvent(new CustomEvent("kiku-pincode-change", { detail: currentPincode }));
};

export const saveKikuPincode = (pincode: string): string => {
  const normalized = String(pincode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(normalized)) throw new Error("Enter a valid 6-digit PIN code.");
  currentPincode = normalized;
  try { localStorage.setItem(PIN_KEY, normalized); localStorage.setItem(PROMPT_KEY, "true"); } catch { /* guest cache only */ }
  window.dispatchEvent(new CustomEvent("kiku-pincode-change", { detail: normalized }));
  if (isKikuAuthenticated()) void api.updatePreferences({ pincode: normalized }).catch(() => {});
  return normalized;
};

export const hydrateKikuPincode = async () => {
  if (!isKikuAuthenticated()) return;
  try {
    const result = await api.getPreferences();
    if (result.preferences?.pincode) {
      setKikuPincodeFromServer(result.preferences.pincode);
    } else if (/^[1-9]\d{5}$/.test(currentPincode)) {
      // Carry a guest's locally stored discovery hint into the authenticated account once.
      await api.updatePreferences({ pincode: currentPincode });
    }
  } catch { /* session may be unavailable */ }
};

export const hasDismissedKikuPincodePrompt = () => { try { return localStorage.getItem(PROMPT_KEY) === "true"; } catch { return false; } };
export const dismissKikuPincodePrompt = () => { try { localStorage.setItem(PROMPT_KEY, "true"); } catch {} window.dispatchEvent(new CustomEvent("kiku-pincode-prompt-dismissed")); };

export const clearKikuPincode = () => {
  currentPincode = "";
  try {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(PROMPT_KEY);
  } catch { /* guest cache cleanup only */ }
  window.dispatchEvent(new CustomEvent("kiku-pincode-change", { detail: "" }));
};
