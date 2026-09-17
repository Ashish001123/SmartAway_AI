import { X, Trash2 } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { axiosInstance } from "../lib/axios";
import { useAIStore } from "../store/ai.store";
import { isUserBusy } from "../lib/utils";
import { useE2EEStore } from "../store/useE2EEStore";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser, clearChat } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const hasDeviceKeys = useE2EEStore((state) => state.status === "ready");

  if (!selectedUser) return null;

  const isAI = selectedUser._id === "ai_assistant";

  const handleDeleteChat = async () => {
    if (isAI) {
      if (window.confirm("Clear your conversation with the AI Assistant?")) {
        await useAIStore.getState().clearHistory();
      }
      return;
    }

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this chat?"
    );

    if (!confirmDelete) return;

    try {
      await axiosInstance.delete(`/messages/delete/${selectedUser._id}`);
      clearChat(selectedUser._id);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to delete chat");
    }
  };

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        
        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img
                src={
                  isAI
                    ? "/ai.png"
                    : selectedUser.profilePic || "/avatar.png"
                }
                alt={selectedUser.fullName}
              />
            </div>
          </div>

          <div>
            <h3 className="font-medium">
              {isAI ? "AI Assistant" : selectedUser.fullName}
            </h3>
            <p className="text-sm text-base-content/70">
              {isAI
                ? "Online"
                : onlineUsers.includes(selectedUser._id)
                ? "Online"
                : "Offline"} 
              {!isAI && isUserBusy(selectedUser) && (
                <span className="text-warning">
                  {selectedUser.useAI === false ? " · Busy" : " · Busy, AI assistant replying"}
                </span>
              )}
            </p>
            {!isAI && (
              <p
                className={`text-[10px] flex items-center gap-1 font-medium mt-0.5 select-none ${
                  hasDeviceKeys && selectedUser.publicKey ? "text-emerald-500" : "text-base-content/60"
                }`}
                title={
                  hasDeviceKeys && selectedUser.publicKey
                    ? "Only you and this contact can read new messages"
                    : "Upgrades to end-to-end encryption once you both set a chat PIN"
                }
              >
                {hasDeviceKeys && selectedUser.publicKey ? "🔒 End-to-end encrypted" : "🔐 Encrypted (standard)"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteChat}
            className="text-red-500 hover:bg-red-100 p-2 rounded"
            title="Delete Chat"
          >
            <Trash2 size={18} />
          </button>

          <button
            onClick={() => setSelectedUser(null)}
            className="hover:bg-base-200 p-2 rounded"
            title="Close Chat"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;