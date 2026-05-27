

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";

import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";

const AI_USER = {
  _id: "ai_assistant",
  fullName: "AI Assistant",
  profilePic: "/ai.png",
};

const Sidebar = () => {
  const {
    getUsers,
    users,
    selectedUser,
    setSelectedUser,
    clearUnread,
    isUsersLoading,
    receiveMessage,
  } = useChatStore();

  const { onlineUsers, socket } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      const { selectedUser } = useChatStore.getState();
      const authUser = useAuthStore.getState().authUser;

      const isInActiveChat =
        selectedUser &&
        (message.senderId === selectedUser._id ||
          (message.isAutoReply && message.receiverId === selectedUser._id));

      if (!isInActiveChat) {
        receiveMessage(message);
      }
    };

    socket.on("newMessage", handleNewMessage);

    return () => socket.off("newMessage", handleNewMessage);
  }, [socket, receiveMessage]);

  const filteredUsers = showOnlineOnly
    ? users.filter((user) => onlineUsers.includes(user._id))
    : users;

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="h-full w-20 lg:w-72 border-r border-base-300 flex flex-col">
      <div className="border-b border-base-300 w-full p-5">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block">Contacts</span>
        </div>

        <div className="mt-3 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">
            ({onlineUsers.length - 1} online)
          </span>
        </div>
      </div>
      <div className="overflow-y-auto w-full py-3">
        <button
          onClick={() => setSelectedUser(AI_USER)}
          className={`
            w-full p-3 flex items-center gap-3
            hover:bg-base-300
            ${
              selectedUser?._id === AI_USER._id
                ? "bg-base-300 ring-1 ring-base-300"
                : ""
            }
          `}
        >
          <div className="relative mx-auto lg:mx-0">
            <img
              src="/ai.png"
              alt="AI Assistant"
              className="size-12 rounded-full"
            />
          </div>

          <div className="hidden lg:block text-left flex-1">
            <div className="font-medium">AI Assistant</div>
            <div className="text-sm text-zinc-400">Ask anything</div>
          </div>
        </button>
        {filteredUsers.map((user) => (
          <button
            key={user._id}
            onClick={async () => {
              setSelectedUser(user);
              clearUnread(user._id);
              
              // Request browser notification permission on user gesture
              if (typeof window !== "undefined" && "Notification" in window) {
                if (Notification.permission === "default") {
                  Notification.requestPermission().catch(console.error);
                }
              }

              try {
                await axiosInstance.put(`/messages/read/${user._id}`);
              } catch {
                console.error("Error marking messages as read");
              }
            }}
            className={`
              w-full p-3 flex items-center gap-3
              hover:bg-base-300
              ${
                selectedUser?._id === user._id
                  ? "bg-base-300 ring-1 ring-base-300"
                  : ""
              }
            `}
          >
            <div className="relative mx-auto lg:mx-0">
              <img
                src={user.profilePic || "/avatar.png"}
                alt={user.fullName}
                className="size-12 rounded-full"
              />
              {onlineUsers.includes(user._id) && (
                <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-900" />
              )}
            </div>

            <div className="hidden lg:block flex-1 text-left">
              <div className="font-medium truncate">{user.fullName}</div>
              <div className="text-sm text-zinc-400">
                {onlineUsers.includes(user._id) ? "Online" : "Offline"}
              </div>
            </div>

            {user.unreadCount > 0 && (
              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                {user.unreadCount > 9 ? "9+" : user.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;