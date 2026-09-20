const PIN_KEY = "kiku-pincode";
const PROMPT_KEY = "kiku-pincode-prompt-dismissed";

export const getKikuPincode = () => {
  try {
    return localStorage.getItem(PIN_KEY) || "";
  } catch {
    return "";
  }
};

export const saveKikuPincode = (pincode: string): string => {
  const normalized = String(pincode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(normalized)) throw new Error("Enter a valid 6-digit PIN code.");
  localStorage.setItem(PIN_KEY, normalized);
  localStorage.setItem(PROMPT_KEY, "true");
  window.dispatchEvent(new CustomEvent("kiku-pincode-change", { detail: normalized }));
  return normalized;
};

export const hasDismissedKikuPincodePrompt = () => {
  try {
    return localStorage.getItem(PROMPT_KEY) === "true";
  } catch {
    return false;
  }
};

export const dismissKikuPincodePrompt = () => {
  localStorage.setItem(PROMPT_KEY, "true");
  window.dispatchEvent(new CustomEvent("kiku-pincode-prompt-dismissed"));
};
