import { useEffect, useState } from "react";
import { saveKikuPincode } from "../../stores/location-store";

export default function PincodeDialog({ open, currentPincode, forced = false, onSaved, onSkip, onClose }) {
  const [value, setValue] = useState(currentPincode || "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValue(currentPincode || "");
      setError("");
    }
  }, [open, currentPincode]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    try {
      const saved = saveKikuPincode(value);
      onSaved?.(saved);
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const skip = () => {
    onSkip?.();
  };

  return (
    <div className="kiku-pincode-overlay" role="dialog" aria-modal="true" aria-labelledby="kiku-pincode-title" onMouseDown={(event) => { if (!forced && event.target === event.currentTarget) onClose?.(); }}>
      <div className="kiku-pincode-dialog">
        {!forced && <button type="button" className="kiku-pincode-close" onClick={onClose} aria-label="Close">×</button>}
        <span className="eyebrow">START CLOSE TO HOME</span>
        <h2 id="kiku-pincode-title">Tell Kiku where to look.</h2>
        <p className="kiku-pincode-copy">Enter your 6-digit PIN code so Kiku can keep dish and price suggestions focused on what is available around your area.</p>
        <form onSubmit={submit} className="kiku-pincode-form">
          <label htmlFor="kiku-pincode-input">PIN code</label>
          <input id="kiku-pincode-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="e.g. 282001" autoFocus />
          {error && <p className="kiku-pincode-error" role="alert">{error}</p>}
          <button type="submit" className="kiku-pincode-primary">Save PIN</button>
        </form>
        <div className="kiku-pincode-privacy">
<<<<<<< HEAD
          <strong>How Kiku uses your PIN</strong>
          <span>Your PIN is used only as a discovery hint for food-price lookups. When you are signed in it is stored with your Kiku preferences; guests keep a browser copy for convenience.</span>
=======
          <strong>Your data stays local.</strong>
          <span>Your PIN is not your exact location. Kiku keeps it stored locally in this browser and does not share it with anyone.</span>
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
        </div>
        <button type="button" className="kiku-pincode-skip" onClick={skip}>Not now — keep exploring</button>
      </div>
    </div>
  );
}
