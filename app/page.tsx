'use client';

import { useState, useRef, useEffect } from 'react';
import { ConversationState, OrderLineItem } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  lineItem?: OrderLineItem;
}

export default function OrderEntryAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI order entry assistant. Tell me what you need and I'll help you build a complete line item. For example:\n\n\"I need 500 of product 5790 in black with a one-color imprint\"\n\n\"Get me pricing on 250 tumblers from HIT, product 16103\"",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/process-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: userMessage,
          currentState: conversationState,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConversationState(data.state);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            lineItem: data.state.lineItem,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || 'Sorry, something went wrong. Please try again.',
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection error. Please check your network and try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setConversationState(null);
    setMessages([
      {
        role: 'assistant',
        content: "Starting fresh! What would you like to order?",
      },
    ]);
  };

  const handleQuickOption = (option: string) => {
    setInput(option);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>AI Order Entry Assistant</h1>
          <p>Natural language to line item in seconds</p>
        </div>
        <button onClick={handleReset} className="reset-btn">
          New Order
        </button>
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-content">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i}>{line || <br />}</p>
                ))}
                {msg.lineItem && <LineItemCard lineItem={msg.lineItem} />}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message assistant">
              <div className="message-content loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {conversationState?.questions && conversationState.questions.length > 0 && (
          <div className="quick-options">
            {conversationState.questions[0].options?.slice(0, 6).map((opt, idx) => (
              <button key={idx} onClick={() => handleQuickOption(opt)} className="quick-option">
                {opt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              conversationState?.questions?.[0]?.question || 
              "Describe your order... (e.g., '500 black tumblers, product 5790')"
            }
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? '...' : 'Send'}
          </button>
        </form>
      </main>

      <footer className="app-footer">
        <p>Powered by PromoStandards + Claude AI | Demo for IPU</p>
      </footer>

      <style jsx>{`
        .app-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #0a1628 0%, #1a365d 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .app-header {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-content h1 {
          color: #fff;
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
        }

        .header-content p {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.875rem;
          margin: 0.25rem 0 0;
        }

        .reset-btn {
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #60a5fa;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .reset-btn:hover {
          background: rgba(59, 130, 246, 0.3);
          border-color: #60a5fa;
        }

        .chat-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
          padding: 1rem;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 0;
        }

        .message {
          margin-bottom: 1rem;
          display: flex;
        }

        .message.user {
          justify-content: flex-end;
        }

        .message.assistant {
          justify-content: flex-start;
        }

        .message-content {
          max-width: 80%;
          padding: 1rem 1.25rem;
          border-radius: 16px;
          line-height: 1.5;
        }

        .message.user .message-content {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.assistant .message-content {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.9);
          border-bottom-left-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .message-content p {
          margin: 0 0 0.5rem;
        }

        .message-content p:last-child {
          margin-bottom: 0;
        }

        .loading {
          display: flex;
          gap: 4px;
          padding: 1rem 1.5rem;
        }

        .dot {
          width: 8px;
          height: 8px;
          background: rgba(255, 255, 255, 0.4);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .quick-options {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.75rem 0;
        }

        .quick-option {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.8);
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-option:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .input-form {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 0;
        }

        .input-form input {
          flex: 1;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          font-size: 1rem;
          outline: none;
          transition: all 0.2s;
        }

        .input-form input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .input-form input:focus {
          border-color: #3b82f6;
          background: rgba(255, 255, 255, 0.1);
        }

        .input-form button {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
          color: white;
          padding: 1rem 2rem;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .input-form button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .input-form button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .app-footer {
          text-align: center;
          padding: 1rem;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}

function LineItemCard({ lineItem }: { lineItem: OrderLineItem }) {
  return (
    <div className="line-item-card">
      <div className="line-item-header">
        <span className="product-id">{lineItem.productId}</span>
        <span className="part-id">{lineItem.partId}</span>
      </div>
      <h3>{lineItem.productName}</h3>
      <p className="description">{lineItem.description}</p>
      
      <div className="line-item-details">
        <div className="detail-row">
          <span>Color:</span>
          <span>{lineItem.color}</span>
        </div>
        {lineItem.size && (
          <div className="detail-row">
            <span>Size:</span>
            <span>{lineItem.size}</span>
          </div>
        )}
        <div className="detail-row">
          <span>Quantity:</span>
          <span>{lineItem.quantity}</span>
        </div>
        <div className="detail-row">
          <span>Unit Price:</span>
          <span>${lineItem.unitPrice.toFixed(2)}</span>
        </div>
        <div className="detail-row highlight">
          <span>Extended:</span>
          <span>${lineItem.extendedPrice.toFixed(2)}</span>
        </div>
      </div>

      {lineItem.charges.length > 0 && (
        <div className="charges-section">
          <h4>Decoration Charges</h4>
          {lineItem.charges.map((charge, idx) => (
            <div key={idx} className="charge-row">
              <span>{charge.name}</span>
              <span>${charge.extendedPrice.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="total-row">
        <span>Total</span>
        <span>${lineItem.totalWithCharges.toFixed(2)}</span>
      </div>

      {lineItem.fobPoint && (
        <p className="fob-info">Ships from: {lineItem.fobPoint}</p>
      )}

      <style jsx>{`
        .line-item-card {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.25rem;
          margin-top: 1rem;
        }

        .line-item-header {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .product-id, .part-id {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: monospace;
        }

        h3 {
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }

        .description {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.875rem;
          margin: 0 0 1rem;
        }

        .line-item-details {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 0.75rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 0.35rem 0;
          font-size: 0.875rem;
        }

        .detail-row span:first-child {
          color: rgba(255, 255, 255, 0.6);
        }

        .detail-row span:last-child {
          color: white;
          font-weight: 500;
        }

        .detail-row.highlight {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin-top: 0.5rem;
          padding-top: 0.75rem;
        }

        .charges-section {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin-top: 0.75rem;
          padding-top: 0.75rem;
        }

        .charges-section h4 {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 0.5rem;
        }

        .charge-row {
          display: flex;
          justify-content: space-between;
          padding: 0.25rem 0;
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.8);
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          border-top: 2px solid rgba(59, 130, 246, 0.4);
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .total-row span:first-child {
          color: rgba(255, 255, 255, 0.8);
        }

        .total-row span:last-child {
          color: #60a5fa;
        }

        .fob-info {
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.75rem;
          margin: 0.75rem 0 0;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
