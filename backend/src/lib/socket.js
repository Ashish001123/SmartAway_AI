import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import { warmUpAIService } from "./ai.js";

const app = express();
const server = http.createServer(app);

let clientUrl = process.env.CLIENT_URL || "https://fullstack-chat-app-32t0.onrender.com";
if (clientUrl && !clientUrl.startsWith("http")) {
  clientUrl = `https://${clientUrl}`;
}

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      clientUrl,
    ],
    credentials: true,
  },
});

const readCookie = (header, name) =>
  (header || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

// Identify sockets by the same JWT cookie as the API, never by a user id the client claims
io.use((socket, next) => {
  try {
    const token = readCookie(socket.handshake.headers.cookie, "jwt");
    const { userId } = jwt.verify(decodeURIComponent(token || ""), process.env.JWT_SECRET);
    socket.data.userId = String(userId);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

// Every socket joins a room named after its user id, so emitting to that room reaches all of the
// user's tabs. Counting sockets keeps a user online until their last tab disconnects, even when a
// reconnect lands before the old socket's disconnect.
const userSocketCount = new Map(); // {userId: number of open sockets}

export function getReceiverSocketId(userId) {
  const id = userId?.toString();
  return userSocketCount.has(id) ? id : undefined;
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const { userId } = socket.data;
  socket.join(userId);
  userSocketCount.set(userId, (userSocketCount.get(userId) || 0) + 1);
  io.emit("getOnlineUsers", [...userSocketCount.keys()]);
  warmUpAIService();

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    const remaining = (userSocketCount.get(userId) || 1) - 1;
    if (remaining > 0) userSocketCount.set(userId, remaining);
    else userSocketCount.delete(userId);
    io.emit("getOnlineUsers", [...userSocketCount.keys()]);
  });
});

export { io, app, server };
