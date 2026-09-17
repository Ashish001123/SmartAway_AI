import axios from "axios";

// A sleeping Render free-tier service can take close to a minute to boot
const AI_TIMEOUT_MS = 90 * 1000;
const WARM_UP_INTERVAL_MS = 10 * 60 * 1000;

const getAIBaseUrl = () => {
  let url =
    (process.env.NODE_ENV === "production" ? process.env.AI_URL_PROD : process.env.AI_URL) ||
    "http://127.0.0.1:8000";

  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }
  // The env var may have been set with an endpoint path; keep only the base URL
  return url.replace(/\/+$/, "").replace(/\/(chat|busy-reply)$/, "");
};

export const callAIService = async (path, payload) => {
  try {
    const { data } = await axios.post(`${getAIBaseUrl()}${path}`, payload, {
      timeout: AI_TIMEOUT_MS,
    });
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (error) {
    const detail = error.response?.data?.detail || error.response?.data?.error || error.message;
    throw new Error(`AI service ${path} failed: ${detail}`);
  }
};

let lastWarmUp = 0;

// Wake the AI service in the background so a user's first AI reply isn't stuck behind a cold start
export const warmUpAIService = () => {
  if (Date.now() - lastWarmUp < WARM_UP_INTERVAL_MS) return;
  lastWarmUp = Date.now();
  axios.get(`${getAIBaseUrl()}/health`, { timeout: AI_TIMEOUT_MS }).catch(() => {});
};
