import { Server } from "socket.io";
import http from "http";
import express from "express";

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

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

const userSocketMap = {}; 

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) userSocketMap[userId] = socket.id;
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
