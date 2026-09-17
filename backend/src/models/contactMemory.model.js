import mongoose from "mongoose";

// Short facts the busy agent remembers about a contact across conversations
const contactMemorySchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    facts: [
      {
        _id: false,
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

contactMemorySchema.index({ ownerId: 1, contactId: 1 }, { unique: true });

const ContactMemory = mongoose.model("ContactMemory", contactMemorySchema);

export default ContactMemory;
