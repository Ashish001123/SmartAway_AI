import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";

// Requests from people who asked your busy AI assistant to notify you
export const useNotificationStore = create((set, get) => ({
  notifications: [],

  fetchNotifications: async () => {
    try {
      const res = await axiosInstance.get("/notifications");
      set({ notifications: res.data });
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  },

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications.filter((n) => n._id !== notification._id)],
    })),

  markAllRead: async () => {
    if (!get().notifications.some((n) => !n.isRead)) return;
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, isRead: true })) }));
    try {
      await axiosInstance.put("/notifications/read");
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    }
  },

  clear: () => set({ notifications: [] }),
}));
