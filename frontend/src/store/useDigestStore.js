import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios.js";
import { useChatStore } from "./useChatStore.js";

const REFRESH_THROTTLE_MS = 5 * 60 * 1000;

// "While you were away": what the busy agent handled, with suggested replies
export const useDigestStore = create((set, get) => ({
  items: [],
  isOpen: false,
  isLoading: false,
  lastFetchedAt: 0,
  sendingContactId: null,

  // Resolves true when there's a summary to show
  fetchDigest: async ({ force = false } = {}) => {
    if (get().isLoading) return false;
    if (!force && Date.now() - get().lastFetchedAt < REFRESH_THROTTLE_MS) return false;
    set({ isLoading: true, lastFetchedAt: Date.now() });
    try {
      const res = await axiosInstance.get("/agent/digest");
      if (res.data.available && res.data.items.length) {
        set({ items: res.data.items, isOpen: true });
        return true;
      }
      set({ items: [] });
      return false;
    } catch (error) {
      console.error("Failed to load away summary:", error);
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  close: () => set({ isOpen: false }),

  dismissItem: (contactId) => {
    const items = get().items.filter((item) => item.contactId !== contactId);
    set({ items });
    if (items.length === 0) get().markAllSeen();
  },

  sendReply: async (item, text) => {
    set({ sendingContactId: item.contactId });
    const sent = await useChatStore.getState().sendMessageTo(item.contact, { text });
    set({ sendingContactId: null });
    if (sent) {
      toast.success(`Reply sent to ${item.contact.fullName}`);
      get().dismissItem(item.contactId);
    }
  },

  markAllSeen: async () => {
    set({ isOpen: false, items: [] });
    try {
      await axiosInstance.post("/agent/digest/seen");
    } catch (error) {
      console.error("Failed to mark away summary as seen:", error);
    }
  },
}));
