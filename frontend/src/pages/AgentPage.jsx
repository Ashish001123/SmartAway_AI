import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Brain, CalendarClock, Settings, Sparkles, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { formatSlot, isUserBusy } from "../lib/utils";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useDigestStore } from "../store/useDigestStore";
import RepliesChart from "../components/RepliesChart";

const RANGES = [7, 30, 90];

const formatMinutes = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
};

const compact = (value) => new Intl.NumberFormat("en", { notation: "compact" }).format(value);

const StatTile = ({ label, value, detail }) => (
  <div className="bg-base-200 border border-base-300 rounded-xl p-4">
    <div className="text-sm text-base-content/70">{label}</div>
    <div className="text-3xl font-semibold mt-1">{value}</div>
    {detail && <div className="text-xs text-base-content/60 mt-1">{detail}</div>}
  </div>
);

const AgentPage = () => {
  const { authUser } = useAuthStore();
  const { callbacks, cancelCallback } = useChatStore();
  const { fetchDigest, isLoading: isDigestLoading } = useDigestStore();

  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [memories, setMemories] = useState([]);

  const loadStats = useCallback(async (range) => {
    setIsRefreshing(true);
    try {
      const res = await axiosInstance.get(`/agent/stats?days=${range}`);
      setStats(res.data);
    } catch {
      toast.error("Couldn't load agent stats");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats(days);
  }, [days, loadStats]);

  useEffect(() => {
    axiosInstance
      .get("/agent/memory")
      .then((res) => setMemories(res.data))
      .catch(() => toast.error("Couldn't load agent memory"));
  }, []);

  const forget = async (contact) => {
    if (!window.confirm(`Forget everything your agent remembers about ${contact.fullName}?`)) return;
    try {
      await axiosInstance.delete(`/agent/memory/${contact._id}`);
      setMemories((prev) => prev.filter((m) => m.contactId._id !== contact._id));
    } catch {
      toast.error("Couldn't clear memory");
    }
  };

  const openAwaySummary = async () => {
    const available = await fetchDigest({ force: true });
    if (!available) toast("Nothing new from while you were away", { icon: "👌" });
  };

  const busy = isUserBusy(authUser);
  const totals = stats?.totals;

  return (
    <div className="min-h-screen container mx-auto px-4 pt-20 pb-16 max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Your AI Agent</h1>
            <p className="text-sm text-base-content/70">
              {busy ? "🟡 Busy mode is on. Your agent is replying for you." : "🟢 You're available. Your agent is on standby."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm btn-outline gap-1" onClick={openAwaySummary} disabled={isDigestLoading}>
            <Sparkles size={14} /> Away summary
          </button>
          <Link to="/settings" className="btn btn-sm btn-ghost gap-1">
            <Settings size={14} /> Agent settings
          </Link>
        </div>
      </div>

      {/* One filter row scopes every stat and chart below it */}
      <div className="join">
        {RANGES.map((range) => (
          <button
            key={range}
            className={`btn btn-sm join-item ${days === range ? "btn-primary" : "btn-outline"}`}
            onClick={() => setDays(range)}
          >
            Last {range} days
          </button>
        ))}
      </div>

      <div className={`space-y-6 transition-opacity ${isRefreshing && stats ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile label="Replies handled" value={totals ? compact(totals.repliesHandled) : "–"} />
          <StatTile label="Conversations" value={totals ? compact(totals.conversations) : "–"} />
          <StatTile
            label="Alerts sent to you"
            value={totals ? compact(totals.alerts) : "–"}
            detail={totals?.urgentAlerts ? `${totals.urgentAlerts} urgent` : null}
          />
          <StatTile label="Callbacks booked" value={totals ? compact(totals.callbacksBooked) : "–"} />
          <StatTile
            label="Time saved"
            value={totals ? formatMinutes(totals.minutesSaved) : "–"}
            detail="Estimate: ~1 min per reply"
          />
        </div>

        <div className="bg-base-200 border border-base-300 rounded-xl p-5">
          <h2 className="font-semibold">Agent replies per day</h2>
          <p className="text-xs text-base-content/60">
            Last {days} days{stats ? `, in your time zone (${stats.timeZone})` : ""}
          </p>
          {stats && totals.repliesHandled === 0 ? (
            <p className="text-sm text-base-content/60 py-10 text-center">
              No agent replies in this period yet. Turn on busy mode in settings to put your agent to work.
            </p>
          ) : (
            stats && <RepliesChart key={days} data={stats.daily} />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-base-200 border border-base-300 rounded-xl p-5">
            <h2 className="font-semibold flex items-center gap-2">
              <CalendarClock size={16} /> Upcoming callbacks
            </h2>
            {callbacks.length === 0 ? (
              <p className="text-sm text-base-content/60 mt-3">No callbacks booked.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {callbacks.map((c) => {
                  const iAmOwner = c.ownerId._id === authUser._id;
                  const other = iAmOwner ? c.requesterId : c.ownerId;
                  return (
                    <li key={c._id} className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-lg p-2">
                      <img src={other.profilePic || "/avatar.png"} alt="" className="size-8 rounded-full object-cover" />
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-medium truncate">
                          {iAmOwner ? `Call ${other.fullName} back` : `${other.fullName} calls you`}
                        </div>
                        <div className="text-xs text-base-content/60">{formatSlot(c.start)}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => window.confirm("Cancel this callback?") && cancelCallback(c._id)}
                      >
                        Cancel
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-base-200 border border-base-300 rounded-xl p-5">
            <h2 className="font-semibold">Who your agent talked to most</h2>
            {!stats?.topContacts.length ? (
              <p className="text-sm text-base-content/60 mt-3">No conversations in this period.</p>
            ) : (
              <table className="table table-sm mt-2">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th className="text-right">Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topContacts.map(({ contact, replies }) => (
                    <tr key={contact._id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <img src={contact.profilePic || "/avatar.png"} alt="" className="size-6 rounded-full object-cover" />
                          {contact.fullName}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{replies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="bg-base-200 border border-base-300 rounded-xl p-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Brain size={16} /> What your agent remembers
        </h2>
        <p className="text-xs text-base-content/60">
          Short notes your agent keeps about contacts to follow up in later conversations. Only your agent uses them.
        </p>
        {memories.length === 0 ? (
          <p className="text-sm text-base-content/60 mt-3">Nothing remembered yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {memories.map((memory) => (
              <li key={memory._id} className="bg-base-100 border border-base-300 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <img
                    src={memory.contactId.profilePic || "/avatar.png"}
                    alt=""
                    className="size-7 rounded-full object-cover"
                  />
                  <span className="font-medium text-sm flex-1 truncate">{memory.contactId.fullName}</span>
                  <button
                    className="btn btn-ghost btn-xs text-error gap-1"
                    title="Forget this contact"
                    onClick={() => forget(memory.contactId)}
                  >
                    <Trash2 size={12} /> Forget
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-base-content/80 list-disc list-inside">
                  {memory.facts.map((fact) => (
                    <li key={fact.text}>{fact.text}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AgentPage;
