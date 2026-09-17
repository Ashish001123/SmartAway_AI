const DEFAULT_PRODUCTION_URL = "https://smartaway-chat-app-zvpr.onrender.com";

const withProtocol = (url) => (url.startsWith("http") ? url : `https://${url}`);

// Where users open the app (links in alerts and emails)
export const appBaseUrl = () =>
  process.env.NODE_ENV === "production"
    ? withProtocol(process.env.CLIENT_URL || DEFAULT_PRODUCTION_URL).replace(/\/+$/, "")
    : "http://localhost:5173";

// Where this server is reachable from outside (OAuth redirects, webhooks)
export const apiBaseUrl = () =>
  process.env.NODE_ENV === "production" ? appBaseUrl() : `http://localhost:${process.env.PORT || 5002}`;
