import mongoose from "mongoose";

// Cached "While you were away" summary, regenerated when new agent activity arrives
const digestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    since: { type: Date, required: true },
    // lastDigestSeenAt when this was generated; a change means the cache is stale
    seenAt: { type: Date, default: null },
    activityUpTo: { type: Date, required: true },
    items: [
      {
        _id: false,
        contactId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        summary: { type: String, default: "" },
        priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
        suggestedReply: { type: String, default: "" },
        agentReplies: { type: Number, default: 0 },
        notified: { type: String, enum: ["urgent", "normal", null], default: null },
        callbackStart: { type: Date, default: null },
        ownerReplied: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

const Digest = mongoose.model("Digest", digestSchema);

export default Digest;
