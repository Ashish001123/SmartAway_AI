import { sendTelegramMessage } from "./telegram.js";
import { sendPushToUser } from "./push.js";
import { appBaseUrl } from "./urls.js";

// Sends an alert to every channel the user has connected and enabled.
// `email` is an optional function that sends the channel-specific email template.
export const deliverAlert = async (user, { title, body, path = "/", tag, email }) => {
  const channels = user.notifyChannels || {};
  const jobs = [];

  if (channels.telegram !== false && user.telegramChatId) {
    jobs.push(sendTelegramMessage(user.telegramChatId, `${title}\n\n${body}`, `${appBaseUrl()}${path}`));
  }
  if (channels.push !== false) {
    jobs.push(sendPushToUser(user._id, { title, body, url: path, tag }));
  }
  if (email && channels.email !== false && user.email) {
    jobs.push(email());
  }

  const results = await Promise.allSettled(jobs);
  results
    .filter((result) => result.status === "rejected")
    .forEach((result) => console.error("Alert delivery failed:", result.reason?.message || result.reason));
};
