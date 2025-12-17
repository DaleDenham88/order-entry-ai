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
    <div className="line-item-po">
      <div className="po-header">
        <h3>Line Item Summary</h3>
        <span className="po-product">{lineItem.productId} - {lineItem.productName}</span>
      </div>
      
      <table className="po-table">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Item</th>
            <th>Description</th>
            <th className="right">Price</th>
            <th className="right">Ext Price</th>
          </tr>
        </thead>
        <tbody>
          {/* Main product line */}
          <tr className="product-row">
            <td>{lineItem.quantity}</td>
            <td>{lineItem.partId}</td>
            <td>
              {lineItem.color}
              {lineItem.size && ` / ${lineItem.size}`}
            </td>
            <td className="right">${lineItem.unitPrice.toFixed(2)}</td>
            <td className="right">${lineItem.extendedPrice.toFixed(2)}</td>
          </tr>
          
          {/* Decoration charges */}
          {lineItem.charges.map((charge, idx) => (
            <tr key={idx} className="charge-row">
              <td>{charge.quantity}</td>
              <td>CHARGE</td>
              <td>{charge.name}{charge.description && ` - ${charge.description}`}</td>
              <td className="right">${charge.unitPrice.toFixed(2)}</td>
              <td className="right">${charge.extendedPrice.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="subtotal-row">
            <td colSpan={3}></td>
            <td className="right">Product Subtotal:</td>
            <td className="right">${lineItem.extendedPrice.toFixed(2)}</td>
          </tr>
          {lineItem.charges.length > 0 && (
            <tr className="subtotal-row">
              <td colSpan={3}></td>
              <td className="right">Charges Subtotal:</td>
              <td className="right">${lineItem.charges.reduce((sum, c) => sum + c.extendedPrice, 0).toFixed(2)}</td>
            </tr>
          )}
          <tr className="total-row">
            <td colSpan={3}></td>
            <td className="right"><strong>Line Total:</strong></td>
            <td className="right"><strong>${lineItem.totalWithCharges.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>
      
      {lineItem.decorationMethod && (
        <div className="decoration-summary">
          <strong>Decoration:</strong> {lineItem.decorationMethod}
          {lineItem.decorationLocation && ` at ${lineItem.decorationLocation}`}
          {lineItem.decorationColors && ` (${lineItem.decorationColors} color${lineItem.decorationColors > 1 ? 's' : ''})`}
        </div>
      )}
      
      {lineItem.fobPoint && (
        <div className="fob-info">Ships from: {lineItem.fobPoint}</div>
      )}

      <style jsx>{`
        .line-item-po {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 8px;
          padding: 1.25rem;
          margin-top: 1rem;
          color: #1a1a1a;
        }

        .po-header {
          border-bottom: 2px solid #2563eb;
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
        }

        .po-header h3 {
          color: #1a1a1a;
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 0.25rem;
        }

        .po-product {
          color: #2563eb;
          font-size: 1rem;
          font-weight: 600;
        }

        .po-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .po-table th {
          background: #f1f5f9;
          padding: 0.625rem 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #475569;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .po-table th.right,
        .po-table td.right {
          text-align: right;
        }

        .po-table td {
          padding: 0.625rem 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
        }

        .product-row {
          background: #fefce8;
        }

        .product-row td {
          font-weight: 500;
          color: #1a1a1a;
        }

        .charge-row td {
          color: #64748b;
          font-size: 0.8125rem;
        }

        .subtotal-row td {
          border-bottom: none;
          padding: 0.375rem 0.75rem;
          color: #64748b;
          font-size: 0.8125rem;
        }

        .total-row td {
          border-top: 2px solid #2563eb;
          padding: 0.75rem;
          color: #1a1a1a;
          font-size: 1rem;
        }

        .decoration-summary {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #f1f5f9;
          border-radius: 4px;
          font-size: 0.8125rem;
          color: #475569;
        }

        .fob-info {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #94a3b8;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
