import { useState } from "react";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { MIN_PIN_LENGTH, useE2EEStore } from "../store/useE2EEStore";
import { WrongPinError } from "../lib/crypto";

const EncryptionCard = () => {
  const { status, changePin } = useE2EEStore();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [working, setWorking] = useState(false);

  const statusText = {
    ready: "🔒 End-to-end encryption is active on this device.",
    needs_setup: "Set a chat PIN to turn on end-to-end encryption.",
    needs_unlock: "Enter your chat PIN to unlock your messages on this device.",
  }[status] || "Checking your encryption keys...";

  const openPrompt = () => useE2EEStore.setState({ dismissed: false });

  const submit = async (e) => {
    e.preventDefault();
    if (newPin.length < MIN_PIN_LENGTH) return toast.error(`Use at least ${MIN_PIN_LENGTH} characters`);
    setWorking(true);
    try {
      await changePin(currentPin, newPin);
      setCurrentPin("");
      setNewPin("");
      toast.success("Chat PIN changed");
    } catch (error) {
      toast.error(error instanceof WrongPinError ? error.message : "Couldn't change the PIN");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="card bg-base-200 border border-base-300 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <Lock className="size-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">End-to-end encryption</h3>
          <p className="text-sm text-base-content/70">{statusText}</p>
        </div>
      </div>

      {status === "ready" ? (
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={submit}>
          <input
            type="password"
            className="input input-bordered input-sm flex-1"
            placeholder="Current PIN"
            autoComplete="current-password"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
          <input
            type="password"
            className="input input-bordered input-sm flex-1"
            placeholder="New PIN"
            autoComplete="new-password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
          />
          <button className="btn btn-sm btn-outline" disabled={working || !currentPin || !newPin}>
            {working ? "Changing..." : "Change PIN"}
          </button>
        </form>
      ) : (
        (status === "needs_setup" || status === "needs_unlock") && (
          <button className="btn btn-sm btn-primary self-start" onClick={openPrompt}>
            {status === "needs_setup" ? "Set up chat PIN" : "Unlock messages"}
          </button>
        )
      )}

      <p className="text-xs text-base-content/60 mt-4 leading-relaxed">
        Only you and the person you&apos;re chatting with can read your messages. The one exception: when you message
        someone who is busy, their AI assistant can read messages you send until they&apos;re back, and the chat tells
        you so.
      </p>
    </div>
  );
};

export default EncryptionCard;
