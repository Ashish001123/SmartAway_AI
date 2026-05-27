import { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore } from "../store/useThemeStore";
import { THEMES } from "../constants";
import { Send, Bot, Clock, MessageSquare, AlertTriangle } from "lucide-react";

const PREVIEW_MESSAGES = [
  { id: 1, content: "Hey! How's it going?", isSent: false },
  { id: 2, content: "I'm doing great! Just working on some new features.", isSent: true },
];

const SettingsPage = () => {
  const { theme, setTheme } = useThemeStore();
  const { authUser, updateBusySettings, isUpdatingBusySettings } = useAuthStore();

  const [isBusy, setIsBusy] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [busyMessage, setBusyMessage] = useState("");
  const [busyStart, setBusyStart] = useState("");
  const [busyEnd, setBusyEnd] = useState("");

  useEffect(() => {
    if (authUser) {
      setIsBusy(authUser.isBusy || false);
      setUseAI(authUser.useAI !== false);
      setBusyMessage(authUser.busyMessage || "");
      if (authUser.busyStart) {
        
        const start = new Date(authUser.busyStart);
        const offset = start.getTimezoneOffset();
        const adjustedStart = new Date(start.getTime() - offset * 60 * 1000);
        setBusyStart(adjustedStart.toISOString().slice(0, 16));
      } else {
        setBusyStart("");
      }
      if (authUser.busyEnd) {
        const end = new Date(authUser.busyEnd);
        const offset = end.getTimezoneOffset();
        const adjustedEnd = new Date(end.getTime() - offset * 60 * 1000);
        setBusyEnd(adjustedEnd.toISOString().slice(0, 16));
      } else {
        setBusyEnd("");
      }
    }
  }, [authUser]);

  const handleSaveBusySettings = async () => {
    await updateBusySettings({
      isBusy,
      busyMessage,
      busyStart: busyStart ? new Date(busyStart).toISOString() : null,
      busyEnd: busyEnd ? new Date(busyEnd).toISOString() : null,
      useAI,
    });
  };

  const handleSetQuickBusy = (hours) => {
    const start = new Date();
    const end = new Date();
    end.setHours(start.getHours() + hours);

    const offsetStart = start.getTimezoneOffset();
    const adjustedStart = new Date(start.getTime() - offsetStart * 60 * 1000);
    const offsetEnd = end.getTimezoneOffset();
    const adjustedEnd = new Date(end.getTime() - offsetEnd * 60 * 1000);

    setBusyStart(adjustedStart.toISOString().slice(0, 16));
    setBusyEnd(adjustedEnd.toISOString().slice(0, 16));
    setIsBusy(true);
  };

  const handleClearBusy = () => {
    setBusyStart("");
    setBusyEnd("");
    setIsBusy(false);
  };

  return (
    <div className="min-h-screen container mx-auto px-4 pt-20 pb-16 max-w-5xl">
      <div className="space-y-8">

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Theme</h2>
            <p className="text-sm text-base-content/70">Choose a theme for your chat interface</p>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                className={`
                  group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
                  ${theme === t ? "bg-base-200" : "hover:bg-base-200/50"}
                `}
                onClick={() => setTheme(t)}
              >
                <div className="relative h-8 w-full rounded-md overflow-hidden" data-theme={t}>
                  <div className="absolute inset-0 grid grid-cols-4 gap-px p-1">
                    <div className="rounded bg-primary"></div>
                    <div className="rounded bg-secondary"></div>
                    <div className="rounded bg-accent"></div>
                    <div className="rounded bg-neutral"></div>
                  </div>
                </div>
                <span className="text-[11px] font-medium truncate w-full text-center">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {authUser && (
          <div className="card bg-base-200 border border-base-300 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bot className="size-6 text-primary animate-pulse" />
              <div>
                <h3 className="text-lg font-semibold">Scheduled AI Auto-Responder Agent</h3>
                <p className="text-sm text-base-content/70">
                  Deploy an AI agent to auto-reply to users when you are busy.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label cursor-pointer flex justify-between bg-base-100 p-3 rounded-lg border border-base-300 transition-all hover:bg-base-100/80">
                    <span className="label-text font-medium flex items-center gap-2">
                      <Clock className="size-4 text-primary" />
                      Auto-Responder Status
                    </span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={isBusy}
                      onChange={(e) => setIsBusy(e.target.checked)}
                    />
                  </label>
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer flex justify-between bg-base-100 p-3 rounded-lg border border-base-300 transition-all hover:bg-base-100/80">
                    <span className="label-text font-medium flex items-center gap-2">
                      <Bot className="size-4 text-secondary" />
                      Use Smart AI Agent
                    </span>
                    <input
                      type="checkbox"
                      className="toggle toggle-secondary"
                      checked={useAI}
                      onChange={(e) => setUseAI(e.target.checked)}
                    />
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium flex items-center gap-2">
                      <MessageSquare className="size-4" />
                      {useAI ? "AI Agent Instructions / Busy Status" : "Static Busy Message"}
                    </span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered h-32 text-sm leading-relaxed"
                    placeholder={
                      useAI
                        ? "Tell the AI agent what you are doing (e.g. 'I am in a meeting until 2 PM. Tell them to message me later. If they ask about the app release, say it is tomorrow.')"
                        : "Enter a static message to reply back to users when they message you..."
                    }
                    value={busyMessage}
                    onChange={(e) => setBusyMessage(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4 bg-base-100 p-5 rounded-xl border border-base-300 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-sm mb-3">Schedule Busy Period</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">
                        <span className="label-text text-xs text-base-content/70">Start Time</span>
                      </label>
                      <input
                        type="datetime-local"
                        className="input input-bordered w-full text-sm"
                        value={busyStart}
                        onChange={(e) => setBusyStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">
                        <span className="label-text text-xs text-base-content/70">End Time</span>
                      </label>
                      <input
                        type="datetime-local"
                        className="input input-bordered w-full text-sm"
                        value={busyEnd}
                        onChange={(e) => setBusyEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <span className="text-xs font-semibold text-base-content/70">Quick Presets</span>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm text-xs"
                        onClick={() => handleSetQuickBusy(1)}
                      >
                        1 hr
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm text-xs"
                        onClick={() => handleSetQuickBusy(3)}
                      >
                        3 hrs
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm text-xs"
                        onClick={() => handleSetQuickBusy(8)}
                      >
                        8 hrs
                      </button>
                      <button
                        type="button"
                        className="btn btn-error btn-outline btn-sm text-xs"
                        onClick={handleClearBusy}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                <div className="alert bg-base-200 border border-base-300 text-xs p-3 flex items-start gap-2 mt-4 rounded-lg">
                  <AlertTriangle className="size-4 text-warning flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    When enabled, contacts messaging you will receive an automatic response. Auto-replies are rate-limited to once every 5 minutes per contact.
                  </span>
                </div>
              </div>

            </div>

            <div className="flex justify-end mt-6 border-t border-base-300 pt-4">
              <button
                className="btn btn-primary px-8 flex items-center gap-2"
                onClick={handleSaveBusySettings}
                disabled={isUpdatingBusySettings}
              >
                {isUpdatingBusySettings ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Saving...
                  </>
                ) : (
                  "Save Settings"
                )}
              </button>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-lg font-semibold mb-3">Preview</h3>
          <div className="rounded-xl border border-base-300 overflow-hidden bg-base-100 shadow-lg">
            <div className="p-4 bg-base-200">
              <div className="max-w-lg mx-auto">
                <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                  
                  <div className="px-4 py-3 border-b border-base-300 bg-base-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content font-medium">
                        J
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">John Doe</h3>
                        <p className="text-xs text-base-content/70">Online</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-4 min-h-[200px] max-h-[200px] overflow-y-auto bg-base-100">
                    {PREVIEW_MESSAGES.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.isSent ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`
                            max-w-[80%] rounded-xl p-3 shadow-sm
                            ${message.isSent ? "bg-primary text-primary-content" : "bg-base-200"}
                          `}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p
                            className={`
                              text-[10px] mt-1.5
                              ${message.isSent ? "text-primary-content/70" : "text-base-content/70"}
                            `}
                          >
                            12:00 PM
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-4 border-t border-base-300 bg-base-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input input-bordered flex-1 text-sm h-10"
                        placeholder="Type a message..."
                        value="This is a preview"
                        readOnly
                      />
                      <button className="btn btn-primary h-10 min-h-0">
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
