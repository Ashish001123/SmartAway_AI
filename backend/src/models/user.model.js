import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    isBusy: {
      type: Boolean,
      default: false,
    },
    busyMessage: {
      type: String,
      default: "",
    },
    busyStart: {
      type: Date,
      default: null,
    },
    busyEnd: {
      type: Date,
      default: null,
    },
    useAI: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
