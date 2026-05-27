import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAIStore } from "../store/ai.store";

import { Image, Send, X, Smile } from "lucide-react";
import toast from "react-hot-toast";
import EmojiPicker from "emoji-picker-react";

const MessageInput = ({ isAI }) => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  const { sendMessage } = useChatStore();
  const { sendMessage: sendAIMessage } = useAIStore();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEmojiClick = (emojiData) => {
    setText((prev) => prev + emojiData.emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview) return;

    try {
      if (isAI) {
        await sendAIMessage(text.trim());
      } else {
        await sendMessage({
          text: text.trim(),
          image: imagePreview,
        });
      }

      setText("");
      setImagePreview(null);
      setShowEmoji(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="p-4 w-full relative">
      {imagePreview && !isAI && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
            />
            <button
              onClick={removeImage}
              type="button"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300 flex items-center justify-center"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {showEmoji && (
        <div className="absolute bottom-20 left-4 z-50">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            height={350}
            width={300}
            theme="dark"
          />
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowEmoji((prev) => !prev)}
            className="btn btn-circle btn-ghost text-zinc-400"
          >
            <Smile size={22} />
          </button>

          <input
            ref={inputRef}
            type="text"
            className="w-full input input-bordered rounded-lg input-sm sm:input-md"
            placeholder={isAI ? "Ask AI..." : "Type a message..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          {!isAI && (
            <>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageChange}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`hidden sm:flex btn btn-circle btn-ghost ${imagePreview ? "text-emerald-500" : "text-zinc-400"
                  }`}
              >
                <Image size={20} />
              </button>
            </>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-sm btn-circle"
          disabled={!text.trim() && !imagePreview}
        >
          <Send size={22} />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
