import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { getConversationKey, encryptText, decryptText } from "../lib/crypto.js";

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

  try {
    const key = await getConversationKey(senderId, receiverId);
    const plaintext = await decryptText(ciphertext, key);
    return { ...message, text: plaintext ?? "[Encrypted message]" };
  } catch (err) {
    console.error("Failed to decrypt message:", err);
    return { ...message, text: "[Decryption failed]" };
  }
}

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

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

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      let payload = { ...messageData };

      // E2EE: encrypt text using derived conversation key
      if (messageData.text) {
        try {
          const authUser = useAuthStore.getState().authUser;
          if (authUser && selectedUser) {
            const key = await getConversationKey(authUser._id, selectedUser._id);
            const encryptedText = await encryptText(messageData.text, key);

            payload = {
              ...payload,
              encryptedText,
              text: "", // server stores empty string; plaintext never leaves this device
            };
          }
        } catch (e) {
          console.warn("E2EE encryption error:", e);
        }
      }

      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        payload
      );

      // Decrypt the response so our own sent message renders correctly
      const decrypted = await decryptMessageObj(res.data);

      set({ messages: [...messages, decrypted] });
      get().receiveMessage(res.data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },


  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", async (newMessage) => {
      const { selectedUser, messages } = get();
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
        set({ messages: [...messages, messageToAdd] });
      }

      if (isFromSelectedUser) {
        axiosInstance.put(`/messages/read/${selectedUser._id}`).catch(console.error);
      }
    });

    socket.on("messageReaction", ({ messageId, reactions }) => {
      const { messages } = get();
      set({
        messages: messages.map((m) =>
          m._id === messageId ? { ...m, reactions } : m
        ),
      });
    });

    socket.on("messagesRead", ({ senderId, receiverId }) => {
      const { selectedUser, messages } = get();
      if (selectedUser && selectedUser._id === receiverId) {
        set({
          messages: messages.map((m) =>
            m.senderId === senderId && m.receiverId === receiverId
              ? { ...m, isRead: true }
              : m
          ),
        });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket?.off("newMessage");
    socket?.off("messageReaction");
    socket?.off("messagesRead");
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

  setSelectedUser: (selectedUser) => set({ selectedUser }),

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
