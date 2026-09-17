import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";
import { fetchIntegrations } from "../lib/integrations";
import { formatSlot } from "../lib/utils";

const CONNECT_RESULTS = {
  connected: ["success", "Google Calendar connected"],
  denied: ["error", "Calendar access wasn't granted"],
  error: ["error", "Couldn't connect Google Calendar. Please try again."],
};

const CalendarCard = () => {
  const { authUser } = useAuthStore();
  const [configured, setConfigured] = useState(null);
  const [working, setWorking] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const calendar = authUser?.calendar || {};
  const setCalendar = (next) =>
    useAuthStore.setState((state) => ({ authUser: { ...state.authUser, calendar: { ...state.authUser.calendar, ...next } } }));

  useEffect(() => {
    fetchIntegrations().then((integrations) => setConfigured(integrations.calendar));
  }, []);

  // Google redirects back to /settings?calendar=<result>
  const connectResult = searchParams.get("calendar");
  useEffect(() => {
    if (!connectResult) return;
    const [kind, message] = CONNECT_RESULTS[connectResult] || CONNECT_RESULTS.error;
    toast[kind](message);
    if (connectResult === "connected") useAuthStore.getState().checkAuth();
    setSearchParams({}, { replace: true });
  }, [connectResult, setSearchParams]);

  const run = async (action, fn) => {
    setWorking(action);
    try {
      await fn();
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      setWorking(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      const res = await axiosInstance.get("/calendar/connect");
      window.location.href = res.data.url;
    });

  const updateSetting = (field, value) =>
    run(field, async () => {
      const res = await axiosInstance.put("/calendar/settings", { [field]: value });
      setCalendar(res.data);
    });

  const sync = () =>
    run("sync", async () => {
      const res = await axiosInstance.post("/calendar/sync");
      setCalendar(res.data);
      toast.success("Calendar synced");
    });

  const disconnect = () =>
    run("disconnect", async () => {
      if (!window.confirm("Disconnect Google Calendar?")) return;
      await axiosInstance.delete("/calendar");
      setCalendar({ connected: false, email: null, upcoming: [], lastSyncedAt: null });
    });

  return (
    <div className="card bg-base-200 border border-base-300 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <CalendarDays className="size-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Google Calendar</h3>
          <p className="text-sm text-base-content/70">
            Turn busy mode on automatically during your events, and let contacts book callbacks in your free time.
          </p>
        </div>
      </div>

      {configured === false && (
        <p className="text-sm text-base-content/60">Google Calendar isn&apos;t set up on this server yet.</p>
      )}

      {configured && !calendar.connected && (
        <button className="btn btn-primary btn-sm self-start" onClick={connect} disabled={working === "connect"}>
          {working === "connect" ? "Opening Google..." : "Connect Google Calendar"}
        </button>
      )}

      {configured && calendar.connected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-sm">
              Connected as <strong>{calendar.email || "your Google account"}</strong>
            </div>
            <label className="label cursor-pointer flex justify-between bg-base-100 p-3 rounded-lg border border-base-300">
              <span className="label-text">Busy mode during calendar events</span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={calendar.autoBusy}
                disabled={working === "autoBusy"}
                onChange={(e) => updateSetting("autoBusy", e.target.checked)}
              />
            </label>
            <label className="label cursor-pointer flex justify-between bg-base-100 p-3 rounded-lg border border-base-300">
              <span className="label-text">
                Let the agent mention event titles
                <span className="block text-xs text-base-content/60">Off: it just says you&apos;re in an event</span>
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={calendar.shareEventTitles}
                disabled={working === "shareEventTitles"}
                onChange={(e) => updateSetting("shareEventTitles", e.target.checked)}
              />
            </label>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-outline gap-1" onClick={sync} disabled={working === "sync"}>
                <RefreshCw size={14} className={working === "sync" ? "animate-spin" : ""} />
                Sync now
              </button>
              <button className="btn btn-sm btn-ghost text-error" onClick={disconnect} disabled={working === "disconnect"}>
                Disconnect
              </button>
            </div>
          </div>

          <div className="bg-base-100 border border-base-300 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Upcoming busy time</h4>
            {calendar.upcoming?.length ? (
              <ul className="space-y-2">
                {calendar.upcoming.map((block) => (
                  <li key={block.start} className="text-sm">
                    <div className="font-medium truncate">{block.titles.join(", ")}</div>
                    <div className="text-xs text-base-content/60">
                      {formatSlot(block.start)} – {new Date(block.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-base-content/60">No busy events in the next 7 days.</p>
            )}
            {calendar.lastSyncedAt && (
              <p className="text-[11px] text-base-content/50 mt-3">
                Last synced {new Date(calendar.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarCard;
