import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "../store/useNotificationStore";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/utils";
import { axiosInstance } from "../lib/axios";

const NotificationBell = () => {
  const { notifications, markAllRead } = useNotificationStore();
  const { setSelectedUser, clearUnread } = useChatStore();
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const openChat = (notification) => {
    const contactId = notification.fromUserId?._id;
    if (!contactId) return;
    setSelectedUser(notification.fromUserId);
    clearUnread(contactId);
    axiosInstance.put(`/messages/read/${contactId}`).catch(console.error);
    navigate("/");
    document.activeElement?.blur(); // closes the daisyUI dropdown
  };

  return (
    <div className="dropdown dropdown-end">
      <label
        tabIndex={0}
        className="btn btn-sm btn-ghost relative"
        title="Notifications"
        onClick={markAllRead}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-error text-error-content text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </label>

      <div
        tabIndex={0}
        className="dropdown-content z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-base-100 border border-base-300 rounded-xl shadow-xl"
      >
        <div className="px-4 py-3 border-b border-base-300">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <p className="text-xs text-base-content/60">People who asked your AI assistant to reach you</p>
        </div>

        <ul className="max-h-96 overflow-y-auto">
          {notifications.length === 0 && (
            <li className="px-4 py-6 text-sm text-center text-base-content/60">No notifications yet</li>
          )}
          {notifications.map((n) => (
            <li key={n._id}>
              <button
                onClick={() => openChat(n)}
                className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-base-200 border-b border-base-200 ${
                  n.isRead ? "" : "bg-primary/5"
                }`}
              >
                <img
                  src={n.fromUserId?.profilePic || "/avatar.png"}
                  alt={n.fromUserId?.fullName || "User"}
                  className="size-9 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {n.fromUserId?.fullName || "Deleted user"}
                    </span>
                    <span className="text-[10px] text-base-content/50 flex-shrink-0">
                      {formatMessageTime(n.createdAt)}
                    </span>
                  </div>
                  {n.urgency === "urgent" && (
                    <span className="badge badge-error badge-xs mt-0.5">urgent</span>
                  )}
                  <p className="text-xs text-base-content/70 mt-0.5 line-clamp-2">{n.summary}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default NotificationBell;
