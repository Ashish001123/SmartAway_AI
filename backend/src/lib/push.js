import webpush from "web-push";
import PushSubscription from "../models/pushSubscription.model.js";

let vapidConfigured = false;

export const isPushConfigured = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

const ensureVapid = () => {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_USER || "alerts@smartway.ai"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
};

export const saveSubscription = (userId, { endpoint, keys }) =>
  PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true, new: true }
  );

export const removeSubscription = (userId, endpoint) => PushSubscription.deleteOne({ userId, endpoint });

// payload: {title, body, url, tag}
export const sendPushToUser = async (userId, payload) => {
  if (!isPushConfigured()) return;
  ensureVapid();

  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
      } catch (error) {
        // The browser unsubscribed or the subscription expired
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          console.error("Web push failed:", error.statusCode || "", error.message);
        }
      }
    })
  );
};
