import mongoose from "mongoose";

// A time a busy user will call a contact back, booked through their AI assistant
const callbackSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "cancelled"],
      default: "scheduled",
    },
    source: {
      type: String,
      enum: ["agent", "button"],
      default: "button",
    },
    calendarEventId: { type: String, default: null },
    reminderSentAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

callbackSchema.index({ ownerId: 1, start: 1 });
// Two people can't book the same slot with the same owner
callbackSchema.index(
  { ownerId: 1, start: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } }
);
callbackSchema.index({ requesterId: 1, start: 1 });
callbackSchema.index({ status: 1, reminderSentAt: 1, start: 1 });

const Callback = mongoose.model("Callback", callbackSchema);

export default Callback;
