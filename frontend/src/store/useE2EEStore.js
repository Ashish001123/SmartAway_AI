import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import {
  clearSharedKeyCache,
  generateIdentityKeys,
  toNonExtractable,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "../lib/crypto.js";
import { deleteDeviceKeys, loadDeviceKeys, saveDeviceKeys } from "../lib/keyStore.js";
import { useAuthStore } from "./useAuthStore.js";

export const MIN_PIN_LENGTH = 6;

// status: idle → loading → ready | needs_setup | needs_unlock; `dismissed` hides the prompt for this session
export const useE2EEStore = create((set, get) => ({
  status: "idle",
  privateKey: null,
  publicKey: null,
  dismissed: false,

  init: async (authUser) => {
    if (!authUser || get().status === "loading") return;
    set({ status: "loading" });
    try {
      const device = await loadDeviceKeys(authUser._id);
      if (device && device.publicKey === authUser.publicKey && authUser.hasKeyBackup) {
        set({ status: "ready", privateKey: device.privateKey, publicKey: device.publicKey });
        return;
      }
      // Keys on this device no longer match the account (e.g. reset on another device)
      if (device) await deleteDeviceKeys(authUser._id);
      set({
        status: authUser.hasKeyBackup ? "needs_unlock" : "needs_setup",
        privateKey: null,
        publicKey: null,
      });
    } catch (error) {
      console.error("Failed to initialise encryption keys:", error);
      set({ status: authUser.hasKeyBackup ? "needs_unlock" : "needs_setup" });
    }
  },

  // Creates a new key pair backed up with `pin` (first setup, or a reset that replaces old keys)
  createKeys: async (pin) => {
    const authUser = useAuthStore.getState().authUser;
    const { privateKey, publicKey } = await generateIdentityKeys();
    const encryptedPrivateKey = await wrapPrivateKey(privateKey, pin);
    // Upload first: keys are only kept on this device once the account has the backup
    const res = await axiosInstance.put("/auth/e2ee-keys", { publicKey, encryptedPrivateKey });
    const deviceKey = await toNonExtractable(privateKey);
    await saveDeviceKeys(authUser._id, { privateKey: deviceKey, publicKey });
    clearSharedKeyCache();
    useAuthStore.setState({ authUser: res.data });
    set({ status: "ready", privateKey: deviceKey, publicKey });
  },

  unlock: async (pin) => {
    const authUser = useAuthStore.getState().authUser;
    const { data } = await axiosInstance.get("/auth/e2ee-keys");
    const privateKey = await unwrapPrivateKey(data.encryptedPrivateKey, pin); // throws WrongPinError
    await saveDeviceKeys(authUser._id, { privateKey, publicKey: data.publicKey });
    clearSharedKeyCache();
    set({ status: "ready", privateKey, publicKey: data.publicKey });
  },

  changePin: async (currentPin, newPin) => {
    const { data } = await axiosInstance.get("/auth/e2ee-keys");
    const privateKey = await unwrapPrivateKey(data.encryptedPrivateKey, currentPin, { extractable: true });
    const encryptedPrivateKey = await wrapPrivateKey(privateKey, newPin);
    const res = await axiosInstance.put("/auth/e2ee-keys", { publicKey: data.publicKey, encryptedPrivateKey });
    useAuthStore.setState({ authUser: res.data });
  },

  dismiss: () => set({ dismissed: true }),

  // On logout, remove the key from this device; the PIN backup restores it next time
  forgetDevice: async (userId) => {
    clearSharedKeyCache();
    set({ status: "idle", privateKey: null, publicKey: null, dismissed: false });
    if (userId) await deleteDeviceKeys(userId).catch(() => {});
  },
}));
