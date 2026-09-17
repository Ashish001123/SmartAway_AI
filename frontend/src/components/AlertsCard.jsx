import { useEffect, useState } from "react";
import { BellRing, Mail, MonitorSmartphone, Send } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { axiosInstance } from "../lib/axios";
import { disablePush, enablePush, getPushSubscription, isPushSupported } from "../lib/push";

const ChannelToggle = ({ checked, onChange, disabled }) => (
  <input
    type="checkbox"
    className="toggle toggle-primary toggle-sm"
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    disabled={disabled}
  />
);

const AlertsCard = () => {
  const { authUser, updateBusySettings } = useAuthStore();
  const [integrations, setIntegrations] = useState(null);
  const [pushEnabledHere, setPushEnabledHere] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  const channels = authUser?.notifyChannels || {};

  useEffect(() => {
    axiosInstance
      .get("/integrations")
      .then((res) => setIntegrations(res.data))
      .catch(() => setIntegrations({ telegram: false, push: false }));
    getPushSubscription()
      .then((subscription) => setPushEnabledHere(Boolean(subscription)))
      .catch(() => setPushEnabledHere(false));
  }, []);

  const setChannel = (channel, enabled) => updateBusySettings({ notifyChannels: { [channel]: enabled } });

  const run = async (action, fn) => {
    setBusyAction(action);
    try {
      await fn();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Something went wrong");
    } finally {
      setBusyAction(null);
    }
  };

  const connectTelegram = () =>
    run("telegram", async () => {
      const res = await axiosInstance.post("/telegram/link");
      window.open(res.data.url, "_blank", "noopener");
      toast("Press Start in Telegram to finish connecting", { icon: "📨" });
    });

  const disconnectTelegram = () =>
    run("telegram", async () => {
      await axiosInstance.delete("/telegram/link");
      useAuthStore.setState((state) => ({ authUser: { ...state.authUser, telegramConnected: false } }));
    });

  const togglePush = () =>
    run("push", async () => {
      if (pushEnabledHere) {
        await disablePush();
        setPushEnabledHere(false);
        toast.success("Push alerts turned off on this device");
      } else {
        await enablePush(integrations.pushPublicKey);
        setPushEnabledHere(true);
        toast.success("Push alerts enabled on this device");
      }
    });

  const sendTest = () =>
    run("test", async () => {
      await axiosInstance.post("/alerts/test");
      toast.success("Test alert sent to your connected channels");
    });

  const pushAvailable = integrations?.push && isPushSupported();

  return (
    <div className="card bg-base-200 border border-base-300 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <BellRing className="size-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Alerts</h3>
          <p className="text-sm text-base-content/70">
            Where your AI assistant reaches you when someone needs you. You always get in-app alerts.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-lg p-3">
          <Mail className="size-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Email</div>
            <div className="text-xs text-base-content/60 truncate">{authUser?.email}</div>
          </div>
          <ChannelToggle checked={channels.email !== false} onChange={(v) => setChannel("email", v)} />
        </div>

        <div className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-lg p-3">
          <Send className="size-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Telegram</div>
            <div className="text-xs text-base-content/60">
              {!integrations?.telegram
                ? "Not set up on this server"
                : authUser?.telegramConnected
                  ? "Connected ✅"
                  : "Get instant alerts from the SmartWay AI bot"}
            </div>
          </div>
          {integrations?.telegram &&
            (authUser?.telegramConnected ? (
              <button className="btn btn-xs btn-ghost" onClick={disconnectTelegram} disabled={busyAction === "telegram"}>
                Disconnect
              </button>
            ) : (
              <button className="btn btn-xs btn-outline btn-primary" onClick={connectTelegram} disabled={busyAction === "telegram"}>
                Connect
              </button>
            ))}
          <ChannelToggle
            checked={channels.telegram !== false}
            onChange={(v) => setChannel("telegram", v)}
            disabled={!authUser?.telegramConnected}
          />
        </div>

        <div className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-lg p-3">
          <MonitorSmartphone className="size-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Push notifications</div>
            <div className="text-xs text-base-content/60">
              {!integrations?.push
                ? "Not set up on this server"
                : !isPushSupported()
                  ? "Not supported in this browser"
                  : pushEnabledHere
                    ? "Enabled on this device ✅"
                    : "Alerts even when SmartWay AI is closed"}
            </div>
          </div>
          {pushAvailable && (
            <button
              className={`btn btn-xs ${pushEnabledHere ? "btn-ghost" : "btn-outline btn-primary"}`}
              onClick={togglePush}
              disabled={busyAction === "push"}
            >
              {pushEnabledHere ? "Turn off here" : "Enable here"}
            </button>
          )}
          <ChannelToggle checked={channels.push !== false} onChange={(v) => setChannel("push", v)} disabled={!pushAvailable} />
        </div>
      </div>

      <div className="flex justify-end mt-6 border-t border-base-300 pt-4">
        <button className="btn btn-outline btn-sm" onClick={sendTest} disabled={busyAction === "test"}>
          {busyAction === "test" ? "Sending..." : "Send test alert"}
        </button>
      </div>
    </div>
  );
};

export default AlertsCard;
