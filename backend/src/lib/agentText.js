import { decryptText } from "./e2ee.js";

// The text of a message as the server-side agent may read it
export const agentVisibleText = (message) => {
  if (message.encryptedText) {
    return decryptText(message.encryptedText, message.senderId, message.receiverId);
  }
  return message.text || (message.image ? "[sent an image]" : "");
};
