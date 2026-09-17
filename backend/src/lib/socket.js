import { Server } from "socket.io";
import http from "http";
import express from "express";
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
  },
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

  const userId = socket.handshake.query.userId;
  if (userId) {
    socket.join(userId);
    userSocketCount.set(userId, (userSocketCount.get(userId) || 0) + 1);
  }
  io.emit("getOnlineUsers", [...userSocketCount.keys()]);
  warmUpAIService();

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    if (userId) {
      const remaining = (userSocketCount.get(userId) || 1) - 1;
      if (remaining > 0) userSocketCount.set(userId, remaining);
      else userSocketCount.delete(userId);
    }
    io.emit("getOnlineUsers", [...userSocketCount.keys()]);
  });
});

export { io, app, server };
