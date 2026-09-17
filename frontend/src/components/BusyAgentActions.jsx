import { useState } from "react";
import { BellRing, CalendarPlus } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { formatSlot } from "../lib/utils";

// Options shown to someone chatting with a busy user's AI assistant, under its latest reply
const BusyAgentActions = ({ lastMessage }) => {
  const {
    selectedUser,
    callbacks,
    notifyOwner,
    notifyingOwnerId,
    getCallbackSlots,
    bookCallback,
    isBookingCallback,
  } = useChatStore();
  const [pickerSlots, setPickerSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const firstName = selectedUser.fullName?.split(" ")[0] || "them";
  const hasCallback = callbacks.some(
    (c) => c.ownerId?._id === selectedUser._id || c.requesterId?._id === selectedUser._id
  );
  // Times the agent offered in its reply, else times fetched with the "Book a callback" button
  const offeredSlots = lastMessage.callbackSlots?.length ? lastMessage.callbackSlots : null;
  const slots = offeredSlots || pickerSlots;

  const openPicker = async () => {
    setLoadingSlots(true);
    setPickerSlots(await getCallbackSlots(selectedUser._id));
    setLoadingSlots(false);
  };

  return (
    <div className="pl-12 space-y-2">
      {!hasCallback && slots && (
        <div className="space-y-1.5">
          <div className="text-xs text-base-content/70">
            {slots.length ? `Pick a time for ${firstName} to call you back:` : "No free times in the next few days."}
          </div>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.start}
                className="btn btn-xs btn-outline"
                disabled={isBookingCallback}
                onClick={() => bookCallback(selectedUser._id, slot.start, offeredSlots ? "agent" : "button")}
              >
                {formatSlot(slot.start)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!lastMessage.ownerNotified && (
          <button
            onClick={() => notifyOwner(selectedUser._id)}
            disabled={notifyingOwnerId === selectedUser._id}
            className="btn btn-xs btn-outline btn-primary gap-1"
            title={`Ask the AI assistant to notify ${selectedUser.fullName}`}
          >
            {notifyingOwnerId === selectedUser._id ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <BellRing size={12} />
            )}
            Notify {firstName}
          </button>
        )}
        {!hasCallback && !slots && (
          <button className="btn btn-xs btn-outline gap-1" onClick={openPicker} disabled={loadingSlots}>
            {loadingSlots ? <span className="loading loading-spinner loading-xs" /> : <CalendarPlus size={12} />}
            Book a callback
          </button>
        )}
      </div>
    </div>
  );
};

export default BusyAgentActions;
