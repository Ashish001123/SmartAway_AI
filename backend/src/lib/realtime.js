import { getReceiverSocketId, io } from "./socket.js";

export const emitTo = (userId, event, payload) => {
  const socketId = getReceiverSocketId(userId?.toString());
  if (socketId) io.to(socketId).emit(event, payload);
};
