import { CalendarClock } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { formatSlot } from "../lib/utils";

// Shows an upcoming callback between you and the open contact
const CallbackBanner = () => {
  const { callbacks, selectedUser, cancelCallback } = useChatStore();
  const { authUser } = useAuthStore();

  const callback = callbacks.find(
    (c) => c.ownerId?._id === selectedUser?._id || c.requesterId?._id === selectedUser?._id
  );
  if (!callback) return null;

  const iAmOwner = callback.ownerId._id === authUser._id;
  const firstName = selectedUser.fullName?.split(" ")[0];

  return (
    <div className="px-4 py-2 bg-primary/10 border-b border-base-300 flex items-center gap-2 text-sm">
      <CalendarClock className="size-4 text-primary flex-shrink-0" />
      <span className="flex-1">
        {iAmOwner ? `You'll call ${firstName} back` : `${firstName} will call you back`} on{" "}
        <strong>{formatSlot(callback.start)}</strong>
      </span>
      <button
        className="btn btn-xs btn-ghost text-error"
        onClick={() => {
          if (window.confirm("Cancel this callback?")) cancelCallback(callback._id);
        }}
      >
        Cancel
      </button>
    </div>
  );
};

export default CallbackBanner;
