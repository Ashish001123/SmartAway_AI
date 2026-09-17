import { decryptText } from "./e2ee.js";

export const PRIVATE_MESSAGE_PLACEHOLDER = "[end-to-end encrypted message not shared with the assistant]";

// The text of a message as the server-side agent may read it:
// - agentText: a plaintext copy the sender chose to share because the receiver was busy
// - v2 end-to-end encrypted messages without it stay private
// - legacy (v1) encrypted messages use the old server-derivable key
export const agentVisibleText = (message) => {
  if (message.agentText) return message.agentText;
  if (message.encVersion === 2) return PRIVATE_MESSAGE_PLACEHOLDER;
  if (message.encryptedText) {
    return decryptText(message.encryptedText, message.senderId, message.receiverId);
  }
  return message.text || (message.image ? "[sent an image]" : "");
};
