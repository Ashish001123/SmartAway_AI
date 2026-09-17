import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { MIN_PIN_LENGTH, useE2EEStore } from "../store/useE2EEStore";
import { WrongPinError } from "../lib/crypto";

// Asks for a chat PIN: to create keys on first use, or to unlock them on a new device
const E2EEModal = () => {
  const { status, dismissed, createKeys, unlock, dismiss } = useE2EEStore();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  if (dismissed || (status !== "needs_setup" && status !== "needs_unlock")) return null;

  const creating = status === "needs_setup" || isResetting;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (pin.length < MIN_PIN_LENGTH) return setError(`Use at least ${MIN_PIN_LENGTH} characters`);
    if (creating && pin !== confirmPin) return setError("The PINs don't match");

    setWorking(true);
    try {
      if (creating) {
        await createKeys(pin);
        toast.success(isResetting ? "New encryption keys created" : "Chat PIN set. Your messages are end-to-end encrypted.");
      } else {
        await unlock(pin);
        toast.success("Messages unlocked on this device");
      }
    } catch (err) {
      setError(err instanceof WrongPinError ? err.message : err.response?.data?.message || "Something went wrong. Try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="modal modal-open" role="dialog" aria-labelledby="e2ee-title">
      <form className="modal-box max-w-md" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
            {creating ? <ShieldCheck className="size-5 text-primary" /> : <KeyRound className="size-5 text-primary" />}
          </div>
          <h3 id="e2ee-title" className="text-lg font-bold">
            {isResetting ? "Reset encryption keys" : creating ? "Set up your chat PIN" : "Enter your chat PIN"}
          </h3>
        </div>

        <p className="text-sm text-base-content/70 mt-3 leading-relaxed">
          {isResetting
            ? "This creates new keys. Encrypted messages from before the reset can't be read anymore, on any device."
            : creating
              ? "Your messages are end-to-end encrypted with a key that stays on your devices. Your PIN backs that key up, so you can read your messages on a new device. We can't recover it if you forget it."
              : "Unlock your end-to-end encrypted messages on this device."}
        </p>

        <div className="space-y-3 mt-4">
          <input
            type="password"
            className="input input-bordered w-full"
            placeholder={creating ? `New PIN (at least ${MIN_PIN_LENGTH} characters)` : "Chat PIN"}
            autoComplete={creating ? "new-password" : "current-password"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {creating && (
            <input
              type="password"
              className="input input-bordered w-full"
              placeholder="Confirm PIN"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
          )}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        {!creating && (
          <button
            type="button"
            className="btn btn-link btn-xs px-0 mt-2 text-base-content/60"
            onClick={() => {
              setIsResetting(true);
              setError("");
            }}
          >
            Forgot your PIN? Reset encryption keys
          </button>
        )}

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={dismiss} disabled={working}>
            Not now
          </button>
          <button type="submit" className="btn btn-primary" disabled={working}>
            {working && <span className="loading loading-spinner loading-xs" />}
            {creating ? (isResetting ? "Reset keys" : "Create PIN") : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default E2EEModal;
