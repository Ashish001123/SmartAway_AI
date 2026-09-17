import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useChatStore } from "./useChatStore";
import { useNotificationStore } from "./useNotificationStore";
import { browserTimeZone } from "../lib/utils.js";
// E2EE uses conversation-scoped keys derived on demand, no key generation needed here

const BASE_URL =
  import.meta.env.MODE === "development" ? "http://localhost:5002" : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  // New states for Google OAuth and password reset
  isGoogleLoggingIn: false,
  isSendingOTP: false,
  isResettingPassword: false,
  isVerifyingEmail: false,
  isResendingVerification: false,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
      get().syncTimeZone();
    } catch (error) {
      console.log("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      if (res.data.verificationRequired) {
        toast.success("Verification code sent to your email!");
        return { verificationRequired: true, email: res.data.email };
      }
      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket();
      get().syncTimeZone();
      return { success: true };
    } catch (error) {
      toast.error(error?.response?.data?.message || "Signup failed. Try again.");
      return { error: true };
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully");
      get().connectSocket();
      get().syncTimeZone();
      return { success: true };
    } catch (error) {
      if (error?.response?.status === 403 && error?.response?.data?.needsVerification) {
        toast.error(error.response.data.message || "Email verification required.");
        return { verificationRequired: true, email: error.response.data.email };
      }
      toast.error(error?.response?.data?.message || "Login failed. Try again.");
      return { error: true };
    } finally {
      set({ isLoggingIn: false });
    }
  },

  googleLogin: async (credential) => {
    set({ isGoogleLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/google", { credential });
      set({ authUser: res.data });
      toast.success("Signed in with Google");
      get().connectSocket();
      get().syncTimeZone();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Google sign-in failed. Try again.");
    } finally {
      set({ isGoogleLoggingIn: false });
    }
  },

  verifyEmail: async (email, otp) => {
    set({ isVerifyingEmail: true });
    try {
      const res = await axiosInstance.post("/auth/verify-email", { email, otp });
      set({ authUser: res.data });
      toast.success("Email verified successfully! Welcome aboard.");
      get().connectSocket();
      get().syncTimeZone();
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Verification failed");
      return false;
    } finally {
      set({ isVerifyingEmail: false });
    }
  },

  resendVerificationOTP: async (email) => {
    set({ isResendingVerification: true });
    try {
      const res = await axiosInstance.post("/auth/resend-verification", { email });
      toast.success("Verification code resent to your email");
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to resend code");
      return false;
    } finally {
      set({ isResendingVerification: false });
    }
  },

  forgotPassword: async (email) => {
    set({ isSendingOTP: true });
    try {
      const res = await axiosInstance.post("/auth/forgot-password", { email });
      toast.success("OTP sent to your email");
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send OTP");
      return false;
    } finally {
      set({ isSendingOTP: false });
    }
  },

  resetPassword: async (email, otp, newPassword) => {
    set({ isResettingPassword: true });
    try {
      const res = await axiosInstance.post("/auth/reset-password", { email, otp, newPassword });
      toast.success("Password reset successfully! You can now log in.");
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reset password");
      return false;
    } finally {
      set({ isResettingPassword: false });
    }
  },

  logout: async () => {
    try {
      const { authUser } = get();
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
      useNotificationStore.getState().clear();
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("error in update profile:", error);
      toast.error(error.response.data.message);
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  isUpdatingBusySettings: false,
  updateBusySettings: async (data) => {
    set({ isUpdatingBusySettings: true });
    try {
      const res = await axiosInstance.put("/auth/busy-settings", data);
      set({ authUser: res.data });
      toast.success("Settings saved");
      return res.data;
    } catch (error) {
      console.log("error in update busy settings:", error);
      toast.error(error.response?.data?.message || "Failed to update settings");
    } finally {
      set({ isUpdatingBusySettings: false });
    }
  },

  // The agent offers callback times in the owner's local time, so keep the account's time zone current
  syncTimeZone: async () => {
    const timezone = browserTimeZone();
    const { authUser } = get();
    if (!authUser || authUser.timezone === timezone) return;
    try {
      const res = await axiosInstance.put("/auth/busy-settings", { timezone });
      set({ authUser: res.data });
    } catch (error) {
      console.error("Failed to sync time zone:", error);
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    // `active` is already true while connecting, so a second call (e.g. StrictMode) doesn't open another socket
    if (!authUser || get().socket?.active) return;

    // Request notification permission if not asked yet
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    const socket = io(BASE_URL, {
      query: {
        userId: authUser._id,
      },
    });
    socket.connect();

    set({ socket: socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // Global listener for browser notifications
    socket.on("newMessage", (message) => {
      // Don't show notification for our own sent messages
      if (message.senderId === authUser._id) return;

      const { selectedUser } = useChatStore.getState();
      const isChatActive = selectedUser && selectedUser._id === message.senderId;
      const isWindowActive = !document.hidden;

      // Show notification if the chat is not open, or if the tab is in background
      if (!isChatActive || !isWindowActive) {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const users = useChatStore.getState().users;
          const sender = users.find((u) => u._id === message.senderId);
          const title = sender ? sender.fullName : "New Message";
          
          const options = {
            body: message.text || (message.image ? "📷 Photo" : "New message received"),
            icon: sender?.profilePic || "/avatar.png",
          };

          const notification = new Notification(title, options);
          
          notification.onclick = () => {
            window.focus();
            if (sender) {
              useChatStore.getState().setSelectedUser(sender);
            }
          };
        }
      }
    });

    socket.on("telegramStatus", ({ connected }) => {
      set((state) => ({ authUser: state.authUser && { ...state.authUser, telegramConnected: connected } }));
      if (connected) toast.success("Telegram connected");
    });

    useChatStore.getState().fetchCallbacks();
    socket.on("callbackUpdated", (callback) => useChatStore.getState().applyCallbackUpdate(callback));

    // Someone asked your busy AI assistant to notify you
    useNotificationStore.getState().fetchNotifications();
    socket.on("ownerNotification", (notification) => {
      useNotificationStore.getState().addNotification(notification);

      const from = notification.fromUserId?.fullName || "Someone";
      const titles = {
        callback_booked: `📅 ${from} booked a callback`,
        callback_cancelled: `🗓️ ${from} cancelled a callback`,
        callback_reminder: `📞 Callback with ${from} soon`,
      };
      const title =
        titles[notification.type] || `${notification.urgency === "urgent" ? "🚨 Urgent: " : "🔔 "}${from} needs you`;
      toast(`${title}: ${notification.summary}`, { id: notification._id, duration: 8000 });

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const browserNotification = new Notification(title, {
          body: notification.summary,
          icon: notification.fromUserId?.profilePic || "/avatar.png",
          tag: notification._id,
        });
        browserNotification.onclick = () => {
          window.focus();
          if (notification.fromUserId?._id) {
            useChatStore.getState().setSelectedUser(notification.fromUserId);
          }
        };
      }
    });
  },
  disconnectSocket: () => {
    if (get().socket?.connected) {
      get().socket.off("newMessage");
      get().socket.off("ownerNotification");
      get().socket.off("telegramStatus");
      get().socket.off("callbackUpdated");
      get().socket.disconnect();
    }
  },
}));