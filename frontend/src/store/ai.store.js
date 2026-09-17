import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios.js";

export const useAIStore = create((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  historyLoaded: false,

  loadHistory: async () => {
    if (get().historyLoaded) return;
    try {
      const res = await axiosInstance.get("/ai/history");
      // Keep anything typed while the history request was in flight
      set((state) => ({ messages: [...res.data, ...state.messages], historyLoaded: true }));
    } catch (error) {
      console.error("Failed to load AI chat history:", error);
    }
  },

  clearHistory: async () => {
    try {
      await axiosInstance.delete("/ai/history");
      set({ messages: [], error: null, historyLoaded: true });
    } catch {
      toast.error("Failed to clear AI chat");
    }
  },

  sendMessage: async (text) => {
    set((state) => ({
      messages: [...state.messages, { role: "user", content: text }],
      loading: true,
      error: null,
    }));
    try {
      const res = await axiosInstance.post("/ai", {
        text,
      });

      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: res.data.reply || res.data.response || "No response",
          },
        ],
        loading: false,
        error: null,
      }));
    } catch (error) {
      const message =
        error.response?.data?.error || "The AI assistant is unavailable right now. Please try again.";
      set((state) => ({
        messages: [...state.messages, { role: "assistant", content: `⚠️ ${message}`, isError: true }],
        loading: false,
        error: message,
      }));
    }
  },
}));
