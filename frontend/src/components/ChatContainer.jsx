import { useChatStore } from "../store/useChatStore";
import { useAIStore } from "../store/ai.store";
import { useEffect, useRef } from "react";
import { Trash2, Smile, Check, CheckCheck } from "lucide-react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";

import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    deleteMessage,
    reactToMessage,
  } = useChatStore();

  const { messages: aiMessages } = useAIStore();
  const { authUser, onlineUsers } = useAuthStore();
  const messageEndRef = useRef(null);

  const isAI = selectedUser?._id === "ai_assistant";

  useEffect(() => {
    if (!selectedUser?._id || isAI) return;

    getMessages(selectedUser._id);
    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [
    selectedUser?._id,
    isAI,
    getMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiMessages]);

  if (!isAI && isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  const chatMessages = isAI
    ? aiMessages.map((m, i) => ({
        _id: i,
        text: m.content,
        senderId: m.role === "user" ? authUser._id : "ai",
        createdAt: new Date(),
      }))
    : messages;

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.map((message, idx) => {
          const isMe = message.senderId === authUser._id;
          const isLast = idx === chatMessages.length - 1;

          return (
            <div
              key={message._id}
              className={`chat ${isMe ? "chat-end" : "chat-start"} group`}
            >
              <div className="chat-image avatar">
                <div className="size-10 rounded-full border">
                  <img
                    src={
                      isMe
                        ? authUser.profilePic || "/avatar.png"
                        : isAI
                          ? "/ai.png"
                          : selectedUser.profilePic || "/avatar.png"
                    }
                    alt="profile"
                  />
                </div>
              </div>

              <div
                className="chat-bubble flex flex-col max-w-[70%]
                break-words break-all whitespace-pre-wrap relative pb-4 pr-14"
                ref={isLast ? messageEndRef : null}
              >
                {/* Time & Ticks at bottom right */}
                {!isAI && (
                  <div className="absolute bottom-1 right-1.5 flex items-center gap-1 text-[10px] opacity-80 select-none pointer-events-none">
                    <span>{formatMessageTime(message.createdAt)}</span>
                    {isMe && (
                      <span className="flex items-center flex-shrink-0">
                        {message.isRead ? (
                          <CheckCheck size={15} className="text-blue-500 flex-shrink-0" />
                        ) : (selectedUser && onlineUsers.includes(selectedUser._id)) ? (
                          <CheckCheck size={15} className="text-zinc-400 flex-shrink-0" />
                        ) : (
                          <Check size={15} className="text-zinc-400 flex-shrink-0" />
                        )}
                      </span>
                    )}
                  </div>
                )}
                {message.image && (
                  <img
                    src={message.image}
                    alt="sent"
                    className="max-w-[240px] rounded-lg mb-1"
                  />
                )}
                {message.text && <p>{message.text}</p>}
                {message.isAutoReply && (
                  <span className="text-[9px] opacity-70 mt-1.5 flex items-center gap-1 font-semibold border-t border-base-content/10 pt-1 select-none">
                    🤖 Auto-Reply Agent
                  </span>
                )}
                
                {/* Reactions list */}
                {message.reactions && message.reactions.length > 0 && (
                  <div
                    className={`absolute bottom-[-10px] flex items-center gap-0.5 bg-base-200 border border-base-300 rounded-full px-1.5 py-0.5 text-[10px] shadow-sm z-10 cursor-pointer hover:bg-base-300 select-none
                      ${isMe ? "right-3" : "left-3"}`}
                    onClick={() => {
                      // Click reaction badge to remove own reaction
                      const myReaction = message.reactions.find((r) => r.userId === authUser._id);
                      if (myReaction) {
                        reactToMessage(message._id, myReaction.emoji);
                      }
                    }}
                    title="Click to remove your reaction"
                  >
                    {Array.from(new Set(message.reactions.map((r) => r.emoji))).map((emoji) => (
                      <span key={emoji}>{emoji}</span>
                    ))}
                    {message.reactions.length > 1 && (
                      <span className="text-[9px] opacity-75 font-semibold ml-0.5">
                        {message.reactions.length}
                      </span>
                    )}
                  </div>
                )}

                {/* Message controls container */}
                {!isAI && (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10
                      ${isMe ? "-left-[60px]" : "-right-[60px]"}`}
                  >
                    {/* Emoji Reaction dropdown */}
                    <div className="dropdown dropdown-top dropdown-hover">
                      <label
                        tabIndex={0}
                        className="p-1 rounded-full hover:bg-base-300 text-base-content/70 cursor-pointer flex items-center justify-center"
                      >
                        <Smile size={15} />
                      </label>
                      <div
                        tabIndex={0}
                        className="dropdown-content z-[20] p-1.5 shadow bg-base-200 rounded-full flex flex-row gap-1.5 border border-base-300 mb-1"
                      >
                        {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => reactToMessage(message._id, emoji)}
                            className="hover:scale-125 transition-transform px-1 cursor-pointer text-sm"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => {
                        if (window.confirm("Delete this message?")) {
                          deleteMessage(message._id);
                        }
                      }}
                      className="p-1 rounded-full hover:bg-base-300 text-error cursor-pointer flex items-center justify-center"
                      title="Delete message"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAI ? <MessageInput isAI /> : <MessageInput />}
    </div>
  );
};

export default ChatContainer;
