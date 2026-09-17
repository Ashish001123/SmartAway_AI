import { useEffect, useState } from "react";
import { Bell, CalendarClock, MessageSquare, Send, X } from "lucide-react";
import { useDigestStore } from "../store/useDigestStore";
import { useChatStore } from "../store/useChatStore";
import { formatSlot } from "../lib/utils";

const PRIORITY_BADGES = {
  high: "badge-error",
  medium: "badge-warning",
  low: "badge-ghost",
};

const DigestItem = ({ item }) => {
  const { sendReply, dismissItem, sendingContactId, close } = useDigestStore();
  const { setSelectedUser } = useChatStore();
  const [reply, setReply] = useState(item.suggestedReply);
  const isSending = sendingContactId === item.contactId;

  useEffect(() => setReply(item.suggestedReply), [item.suggestedReply]);

  return (
    <li className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <img src={item.contact.profilePic || "/avatar.png"} alt="" className="size-10 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{item.contact.fullName}</span>
            <span className={`badge badge-sm ${PRIORITY_BADGES[item.priority]}`}>{item.priority}</span>
            {item.notified && (
              <span className="badge badge-sm badge-outline gap-1">
                <Bell size={10} /> {item.notified === "urgent" ? "urgent alert" : "alerted you"}
              </span>
            )}
            {item.callbackStart && (
              <span className="badge badge-sm badge-outline gap-1">
                <CalendarClock size={10} /> {formatSlot(item.callbackStart)}
              </span>
            )}
            {item.ownerReplied && <span className="badge badge-sm badge-success badge-outline">you replied</span>}
          </div>
          <p className="text-sm text-base-content/80 mt-1">{item.summary}</p>
        </div>
        <button className="btn btn-ghost btn-xs btn-circle" title="Dismiss" onClick={() => dismissItem(item.contactId)}>
          <X size={14} />
        </button>
      </div>

      <textarea
        className="textarea textarea-bordered w-full text-sm leading-relaxed"
        rows={2}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-sm btn-ghost gap-1"
          onClick={() => {
            setSelectedUser(item.contact);
            close();
          }}
        >
          <MessageSquare size={14} /> Open chat
        </button>
        <button
          className="btn btn-sm btn-primary gap-1"
          disabled={!reply.trim() || isSending}
          onClick={() => sendReply(item, reply.trim())}
        >
          {isSending ? <span className="loading loading-spinner loading-xs" /> : <Send size={14} />}
          Send reply
        </button>
      </div>
    </li>
  );
};

const AwayDigestModal = () => {
  const { items, isOpen, close, markAllSeen } = useDigestStore();
  if (!isOpen || items.length === 0) return null;

  return (
    <div className="modal modal-open" role="dialog" aria-labelledby="away-digest-title">
      <div className="modal-box max-w-2xl">
        <h3 id="away-digest-title" className="text-xl font-bold">👋 While you were away</h3>
        <p className="text-sm text-base-content/70 mt-1">
          Your AI assistant handled {items.length} conversation{items.length === 1 ? "" : "s"}. Most important first.
        </p>

        <ul className="space-y-3 mt-5 max-h-[60vh] overflow-y-auto pr-1">
          {items.map((item) => (
            <DigestItem key={item.contactId} item={item} />
          ))}
        </ul>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={close}>
            Later
          </button>
          <button className="btn btn-outline" onClick={markAllSeen}>
            Mark all as done
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={close} />
    </div>
  );
};

export default AwayDigestModal;
