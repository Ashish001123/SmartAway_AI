import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { getConversationKey, getSharedKey, encryptText, decryptText } from "../lib/crypto.js";
import { isUserBusy } from "../lib/utils.js";
import { useE2EEStore } from "./useE2EEStore.js";

// ─── E2EE helpers ────────────────────────────────────────────────────────────

/**
 * Decrypt the encrypted fields on a message object using our conversation-scoped key.
 * Returns the message with `text` set to the decrypted plaintext (or the
 * original text if the message was sent unencrypted / auto-reply).
 */
async function decryptMessageObj(message) {
  const authUser = useAuthStore.getState().authUser;
  if (!authUser) return message;

  const senderId = message.senderId?.toString();
  const receiverId = message.receiverId?.toString();
  if (!senderId || !receiverId) return message;

  const ciphertext = message.encryptedText;
  if (!ciphertext) return message; // legacy / auto-reply — keep as-is

  if (message.encVersion === 2) {
    const { privateKey, publicKey } = useE2EEStore.getState();
    if (!privateKey) {
      return { ...message, text: "🔒 Enter your chat PIN to read this message", isLocked: true };
    }
    const sentByMe = senderId === authUser._id;
    const myKeyUsed = sentByMe ? message.encKeys?.sender : message.encKeys?.receiver;
    const theirKey = sentByMe ? message.encKeys?.receiver : message.encKeys?.sender;
    if (myKeyUsed !== publicKey || !theirKey) {
      return { ...message, text: "🔒 Encrypted with keys from before a reset", isLocked: true };
    }
    try {
      const key = await getSharedKey(privateKey, theirKey, senderId, receiverId);
      const plaintext = await decryptText(ciphertext, key);
      return { ...message, text: plaintext ?? "[Decryption failed]" };
    } catch (err) {
      console.error("Failed to decrypt message:", err);
      return { ...message, text: "[Decryption failed]" };
    }
  }

  try {
    const key = await getConversationKey(senderId, receiverId);
    const plaintext = await decryptText(ciphertext, key);
    return { ...message, text: plaintext ?? "[Encrypted message]" };
  } catch (err) {
    console.error("Failed to decrypt message:", err);
    return { ...message, text: "[Decryption failed]" };
  }
}

// Encrypts outgoing text: v2 when both people have keys, otherwise the legacy conversation key.
// When the receiver is busy, a readable copy is shared with their AI assistant (the chat says so).
async function buildEncryptedPayload(messageData, targetUser) {
  const authUser = useAuthStore.getState().authUser;
  if (!messageData.text || !authUser || !targetUser) return { ...messageData };

  const { privateKey, publicKey } = useE2EEStore.getState();
  let payload;
  if (privateKey && publicKey && targetUser.publicKey) {
    const key = await getSharedKey(privateKey, targetUser.publicKey, authUser._id, targetUser._id);
    payload = {
      ...messageData,
      text: "",
      encryptedText: await encryptText(messageData.text, key),
      encVersion: 2,
      encKeys: { sender: publicKey, receiver: targetUser.publicKey },
    };
  } else {
    const key = await getConversationKey(authUser._id, targetUser._id);
    payload = { ...messageData, text: "", encryptedText: await encryptText(messageData.text, key) };
  }

  if (isUserBusy(targetUser)) payload.agentText = messageData.text;
  return payload;
}

const appendMessage = (messages, message) =>
  messages.some((m) => m._id === message._id) ? messages : [...messages, message];

// Handlers registered for the open chat, kept so we remove only these and not other components' listeners
let chatSocketHandlers = null;

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  agentTyping: {}, // {chatPartnerId: {ownerId}} while a busy user's AI assistant is replying
  notifyingOwnerId: null,
  callbacks: [], // upcoming callbacks where I'm the owner or the requester
  isBookingCallback: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      const usersWithUnread = res.data.map((u) => ({
        ...u,
        unreadCount: u.unreadCount || 0,
      }));

      set({ users: usersWithUnread });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);

      // Decrypt each message client-side
      const decrypted = await Promise.all(
        res.data.map((msg) => decryptMessageObj(msg))
      );
      set({ messages: decrypted });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: (messageData) => get().sendMessageTo(get().selectedUser, messageData),

  // Sends to any contact (e.g. a one-tap reply from the away summary); returns true on success
  sendMessageTo: async (targetUser, messageData, isRetry = false) => {
    try {
      const payload = await buildEncryptedPayload(messageData, targetUser);
      const res = await axiosInstance.post(`/messages/send/${targetUser._id}`, payload);

      // Decrypt the response so our own sent message renders correctly
      const decrypted = await decryptMessageObj(res.data);

      // An auto-reply can arrive over the socket before this resolves, so merge into the latest state
      if (get().selectedUser?._id === targetUser._id) {
        set((state) => ({ messages: appendMessage(state.messages, decrypted) }));
      }
      get().receiveMessage(res.data);
      return true;
    } catch (error) {
      // The contact reset their keys since we loaded them: pick up the new key and try once more
      if (!isRetry && error.response?.data?.code === "STALE_PUBLIC_KEY") {
        get().updateUserPublicKey(targetUser._id, error.response.data.receiverPublicKey);
        const refreshed = { ...targetUser, publicKey: error.response.data.receiverPublicKey };
        return get().sendMessageTo(refreshed, messageData, true);
      }
      toast.error(error.response?.data?.message || "Failed to send message");
      return false;
    }
  },

  updateUserPublicKey: (userId, publicKey) =>
    set((state) => ({
      users: state.users.map((u) => (u._id === userId ? { ...u, publicKey } : u)),
      selectedUser:
        state.selectedUser?._id === userId ? { ...state.selectedUser, publicKey } : state.selectedUser,
    })),

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    get().unsubscribeFromMessages();

    chatSocketHandlers = {
      newMessage: async (newMessage) => {
        const { selectedUser } = get();
        const authUser = useAuthStore.getState().authUser;

        const isFromSelectedUser = selectedUser && newMessage.senderId === selectedUser._id;
        const isSentByMeToSelectedUser =
          selectedUser &&
          authUser &&
          newMessage.senderId === authUser._id &&
          newMessage.receiverId === selectedUser._id;

        if (isFromSelectedUser || isSentByMeToSelectedUser) {
          // Decrypt before adding to state
          const decrypted = await decryptMessageObj(newMessage);
          const messageToAdd = isFromSelectedUser ? { ...decrypted, isRead: true } : decrypted;
          if (get().selectedUser?._id === selectedUser._id) {
            set((state) => ({ messages: appendMessage(state.messages, messageToAdd) }));
          }
        }

        if (isFromSelectedUser) {
          axiosInstance.put(`/messages/read/${selectedUser._id}`).catch(console.error);
        }
      },

      messageReaction: ({ messageId, reactions }) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m._id === messageId ? { ...m, reactions } : m
          ),
        }));
      },

      messagesRead: ({ senderId, receiverId }) => {
        const { selectedUser } = get();
        if (selectedUser && selectedUser._id === receiverId) {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.senderId === senderId && m.receiverId === receiverId
                ? { ...m, isRead: true }
                : m
            ),
          }));
        }
      },

      agentTyping: ({ chatWith, ownerId, isTyping }) => {
        set((state) => {
          const agentTyping = { ...state.agentTyping };
          if (isTyping) agentTyping[chatWith] = { ownerId };
          else delete agentTyping[chatWith];
          return { agentTyping };
        });
      },
    };

    Object.entries(chatSocketHandlers).forEach(([event, handler]) => socket.on(event, handler));
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket && chatSocketHandlers) {
      Object.entries(chatSocketHandlers).forEach(([event, handler]) => socket.off(event, handler));
    }
    chatSocketHandlers = null;
  },

  fetchCallbacks: async () => {
    try {
      const res = await axiosInstance.get("/callbacks");
      set({ callbacks: res.data });
    } catch (error) {
      console.error("Failed to load callbacks:", error);
    }
  },

  applyCallbackUpdate: (callback) =>
    set((state) => {
      const others = state.callbacks.filter((c) => c._id !== callback._id);
      const upcoming = callback.status === "scheduled" && new Date(callback.end) > new Date();
      return {
        callbacks: upcoming
          ? [...others, callback].sort((a, b) => new Date(a.start) - new Date(b.start))
          : others,
      };
    }),

  getCallbackSlots: async (ownerId) => {
    try {
      const res = await axiosInstance.get(`/callbacks/slots/${ownerId}`);
      return res.data.slots;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't load callback times");
      return [];
    }
  },

  bookCallback: async (ownerId, start, source = "button") => {
    set({ isBookingCallback: true });
    try {
      const res = await axiosInstance.post("/callbacks", { ownerId, start, source });
      get().applyCallbackUpdate(res.data.callback);
      if (get().selectedUser?._id === ownerId) {
        set((state) => ({ messages: appendMessage(state.messages, res.data.message) }));
      }
      toast.success("Callback booked");
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't book the callback");
    } finally {
      set({ isBookingCallback: false });
    }
  },

  cancelCallback: async (callbackId) => {
    try {
      const res = await axiosInstance.patch(`/callbacks/${callbackId}/cancel`);
      get().applyCallbackUpdate(res.data.callback);
      toast.success("Callback cancelled");
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't cancel the callback");
    }
  },

  notifyOwner: async (ownerId) => {
    set({ notifyingOwnerId: ownerId });
    try {
      const res = await axiosInstance.post(`/messages/notify/${ownerId}`);
      if (get().selectedUser?._id === ownerId) {
        set((state) => ({ messages: appendMessage(state.messages, res.data.message) }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't send the notification");
    } finally {
      set({ notifyingOwnerId: null });
    }
  },

  receiveMessage: (message) =>
    set((state) => {
      const authUser = useAuthStore.getState().authUser;
      const authUserId = authUser?._id?.toString();

      const contactId = message.senderId?.toString() === authUserId
        ? message.receiverId?.toString()
        : message.senderId?.toString();

      if (!contactId || contactId === authUserId) return {};

      const shouldIncrement = (message.senderId?.toString() !== authUserId) && !message.isRead && !message.isAutoReply;
      const increment = shouldIncrement ? 1 : 0;

      const updatedUsers = state.users.map((u) =>
        u._id === contactId
          ? { ...u, unreadCount: (u.unreadCount || 0) + increment }
          : u
      );

      const contact = updatedUsers.find((u) => u._id === contactId);
      const rest = updatedUsers.filter((u) => u._id !== contactId);

      return {
        users: contact ? [contact, ...rest] : updatedUsers,
      };
    }),

  clearUnread: (userId) =>
    set((state) => ({
      users: state.users.map((u) =>
        u._id === userId ? { ...u, unreadCount: 0 } : u
      ),
    })),
  
  clearChat: (userId) =>
  set((state) => ({
    messages: [],
    users: state.users.map((u) =>
      u._id === userId ? { ...u, unreadCount: 0 } : u
    ),
  })),

  // Links from notifications carry only a name and picture; use the full contact when we have it
  setSelectedUser: (selectedUser) =>
    set({ selectedUser: selectedUser && (get().users.find((u) => u._id === selectedUser._id) || selectedUser) }),

  deleteMessage: async (messageId) => {
    try {
      await axiosInstance.delete(`/messages/delete-message/${messageId}`);
      set((state) => ({
        messages: state.messages.filter((m) => m._id !== messageId),
      }));
      toast.success("Message deleted");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete message");
    }
  },

  reactToMessage: async (messageId, emoji) => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return;
    const myId = authUser._id.toString();

    const previousMessages = get().messages;

    // 1. Compute optimistic reactions list
    let updatedReactions = [];
    const targetMessage = previousMessages.find((m) => m._id === messageId);
    if (targetMessage) {
      const currentReactions = targetMessage.reactions || [];
      const existingReactionIndex = currentReactions.findIndex((r) => r.userId === myId);

      if (existingReactionIndex > -1) {
        if (currentReactions[existingReactionIndex].emoji === emoji) {
          // toggle off
          updatedReactions = currentReactions.filter((r) => r.userId !== myId);
        } else {
          // change emoji
          updatedReactions = currentReactions.map((r) =>
            r.userId === myId ? { ...r, emoji } : r
          );
        }
      } else {
        // add reaction
        updatedReactions = [...currentReactions, { userId: myId, emoji }];
      }
    }

    // 2. Apply optimistic update immediately
    set((state) => ({
      messages: state.messages.map((m) =>
        m._id === messageId ? { ...m, reactions: updatedReactions } : m
      ),
    }));

    // 3. Make API request in background
    try {
      const res = await axiosInstance.post(`/messages/react/${messageId}`, { emoji });
      // update with actual server response (e.g. database-generated reaction IDs)
      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId ? { ...m, reactions: res.data } : m
        ),
      }));
    } catch (error) {
      // 4. Rollback to original state on failure
      set({ messages: previousMessages });
      toast.error(error.response?.data?.error || "Failed to add reaction");
    }
  },
}));
