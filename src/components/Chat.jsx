import React, { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import DOMPurify from "dompurify";

const Chat = ({ messages, sendMessage, activeTab }) => {
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === "chat") {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  const handleSend = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      // Basic input sanitization before sending
      const cleanInput = DOMPurify.sanitize(chatInput.trim(), { ALLOWED_TAGS: [] });
      if (cleanInput) {
        sendMessage(cleanInput);
      }
      setChatInput("");
    }
  };

  return (
    <div className="panel-content chat-panel">
      <div className="messages-list">
        {messages.map((msg, idx) => {
          // XSS Protection on render
          const cleanText = DOMPurify.sanitize(msg.text, { ALLOWED_TAGS: [] });
          const cleanSender = DOMPurify.sanitize(msg.senderName, { ALLOWED_TAGS: [] });

          return (
            <div
              key={idx}
              className={`message-bubble ${msg.isLocal ? "local" : "remote"}`}
            >
              <div className="message-sender">{cleanSender}</div>
              <div className="message-text">{cleanText}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-area" onSubmit={handleSend}>
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type a message..."
          className="glass-input"
          maxLength={500}
        />
        <button type="submit" className="btn-send" disabled={!chatInput.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default Chat;
