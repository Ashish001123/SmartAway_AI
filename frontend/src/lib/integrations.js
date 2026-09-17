import { axiosInstance } from "./axios.js";

let integrationsPromise = null;

// Which optional integrations (Telegram, push, Google Calendar) the server has configured
export const fetchIntegrations = () => {
  if (!integrationsPromise) {
    integrationsPromise = axiosInstance
      .get("/integrations")
      .then((res) => res.data)
      .catch(() => {
        integrationsPromise = null;
        return { telegram: false, push: false, calendar: false };
      });
  }
  return integrationsPromise;
};
