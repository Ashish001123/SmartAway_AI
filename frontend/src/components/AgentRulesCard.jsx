import { useEffect, useState } from "react";
import { ShieldAlert, Trash2, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const RULE_OPTIONS = [
  { value: "always_notify", label: "Always notify me" },
  { value: "urgent", label: "Treat as urgent" },
  { value: "static_only", label: "Fixed message only" },
];
const MAX_KEYWORDS = 20;

const AgentRulesCard = () => {
  const { authUser, updateBusySettings, isUpdatingBusySettings } = useAuthStore();
  const { users, getUsers } = useChatStore();

  const [rules, setRules] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [newRule, setNewRule] = useState("always_notify");

  useEffect(() => {
    if (users.length === 0) getUsers();
  }, [users.length, getUsers]);

  useEffect(() => {
    setRules(authUser?.contactRules || []);
    setKeywords(authUser?.urgentKeywords || []);
  }, [authUser]);

  const contactName = (id) => users.find((u) => u._id === id)?.fullName || "Unknown contact";
  const contactPic = (id) => users.find((u) => u._id === id)?.profilePic || "/avatar.png";
  const availableContacts = users.filter((u) => !rules.some((r) => r.contactId === u._id));

  const addRule = () => {
    if (!newContactId) return;
    setRules((prev) => [...prev, { contactId: newContactId, rule: newRule }]);
    setNewContactId("");
  };

  const addKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase();
    if (keyword && !keywords.includes(keyword) && keywords.length < MAX_KEYWORDS) {
      setKeywords((prev) => [...prev, keyword]);
    }
    setKeywordInput("");
  };

  const save = () => updateBusySettings({ contactRules: rules, urgentKeywords: keywords });

  return (
    <div className="card bg-base-200 border border-base-300 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="size-6 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Contact Rules & Urgent Keywords</h3>
          <p className="text-sm text-base-content/70">
            Decide how your agent treats specific people, and which words should alert you right away.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Contact rules</h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="select select-bordered select-sm flex-1"
              value={newContactId}
              onChange={(e) => setNewContactId(e.target.value)}
            >
              <option value="">Choose a contact…</option>
              {availableContacts.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <select
              className="select select-bordered select-sm"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
            >
              {RULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-outline" onClick={addRule} disabled={!newContactId}>
              Add
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="text-xs text-base-content/60">
              No rules yet. Everyone gets the default AI agent.
            </p>
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.contactId}
                  className="flex items-center gap-2 bg-base-100 border border-base-300 rounded-lg p-2"
                >
                  <img src={contactPic(r.contactId)} alt="" className="size-8 rounded-full object-cover" />
                  <span className="text-sm flex-1 truncate">{contactName(r.contactId)}</span>
                  <select
                    className="select select-bordered select-xs"
                    value={r.rule}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((x) => (x.contactId === r.contactId ? { ...x, rule: e.target.value } : x))
                      )
                    }
                  >
                    {RULE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    title="Remove rule"
                    onClick={() => setRules((prev) => prev.filter((x) => x.contactId !== r.contactId))}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Urgent keywords</h4>
          <p className="text-xs text-base-content/60">
            If a message contains one of these while you&apos;re busy, you&apos;re notified as urgent.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered input-sm flex-1"
              placeholder="e.g. server down"
              maxLength={40}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={addKeyword}
              disabled={!keywordInput.trim() || keywords.length >= MAX_KEYWORDS}
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => (
              <span key={k} className="badge badge-warning gap-1 py-3">
                {k}
                <button
                  type="button"
                  title={`Remove ${k}`}
                  onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6 border-t border-base-300 pt-4">
        <button className="btn btn-primary px-8" onClick={save} disabled={isUpdatingBusySettings}>
          {isUpdatingBusySettings ? "Saving..." : "Save Rules"}
        </button>
      </div>
    </div>
  );
};

export default AgentRulesCard;
