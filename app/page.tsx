'use client';

import { useState, useRef, useEffect } from 'react';
import { ConversationState, OrderLineItem, AvailableOptions, RequiredFields, DebugLogEntry } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  lineItem?: OrderLineItem;
}

interface ProductInfo {
  productId: string;
  productName: string;
  quantity: number;
}

export default function OrderEntryPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Welcome! Enter your order request to get started.\n\nExample: "500 of product 55900"',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [availableOptions, setAvailableOptions] = useState<AvailableOptions | null>(null);
  const [requiredFields, setRequiredFields] = useState<RequiredFields | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const debugEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
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

      // Always update debug logs if present
      if (data.debugLogs) {
        setDebugLogs(prev => [...prev, ...data.debugLogs]);
      }

      if (data.success) {
        setConversationState(data.state);
        setAvailableOptions(data.availableOptions || null);
        setRequiredFields(data.requiredFields || null);
        setProductInfo(data.productInfo || null);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            lineItem: data.state.lineItem,
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || 'Something went wrong. Please try again.',
          },
        ]);
      }
    } catch (error) {
      setMessages(prev => [
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

  const handleOptionSelect = async (field: string, value: string | number) => {
    if (!conversationState || loading) return;

    setLoading(true);

    try {
      const response = await fetch('/api/process-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: '',
          currentState: conversationState,
          selectionUpdate: { field, value },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConversationState(data.state);
        setAvailableOptions(data.availableOptions || null);
        setRequiredFields(data.requiredFields || null);
        setProductInfo(data.productInfo || null);

        if (data.state.lineItem) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: data.message,
              lineItem: data.state.lineItem,
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Selection error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setConversationState(null);
    setAvailableOptions(null);
    setRequiredFields(null);
    setProductInfo(null);
    setDebugLogs([]);
    setMessages([
      {
        role: 'assistant',
        content: 'Starting fresh! What would you like to order?',
      },
    ]);
  };

  const showOptionsPanel = availableOptions && !conversationState?.lineItem;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Order Entry</h1>
          <p style={styles.subtitle}>AI-powered order processing</p>
        </div>
        <button onClick={handleReset} style={styles.resetButton}>
          New Order
        </button>
      </header>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Debug Panel */}
        <div style={styles.debugPanel}>
          <div style={styles.debugPanelHeader}>
            <h2 style={styles.debugPanelTitle}>API Debug Log</h2>
            <button
              onClick={() => setDebugLogs([])}
              style={styles.clearDebugButton}
            >
              Clear
            </button>
          </div>
          <div style={styles.debugContent}>
            {debugLogs.length === 0 ? (
              <div style={styles.debugEmpty}>No API calls yet. Enter an order to see the SOAP requests/responses.</div>
            ) : (
              debugLogs.map((log, idx) => (
                <div key={idx} style={styles.debugEntry}>
                  <div style={styles.debugEntryHeader}>
                    <span style={styles.debugOperation}>{log.operation}</span>
                    <span style={styles.debugTimestamp}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {log.error && (
                    <div style={styles.debugError}>Error: {log.error}</div>
                  )}
                  {log.request && (
                    <div style={styles.debugSection}>
                      <div style={styles.debugSectionTitle}>Request:</div>
                      <pre style={styles.debugXml}>{log.request}</pre>
                    </div>
                  )}
                  {log.response && (
                    <div style={styles.debugSection}>
                      <div style={styles.debugSectionTitle}>Response:</div>
                      <pre style={styles.debugXml}>{log.response}</pre>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={debugEndRef} />
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ ...styles.chatArea, flex: showOptionsPanel ? '1 1 40%' : '1 1 60%' }}>
          <div style={styles.messagesContainer}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.messageRow,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
                  }}
                >
                  {msg.content}
                  {msg.lineItem && (
                    <div style={styles.lineItemContainer}>
                      <LineItemDisplay lineItem={msg.lineItem} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
                <div style={{ ...styles.messageBubble, ...styles.assistantMessage }}>
                  <div style={styles.loadingDots}>
                    <span style={styles.dot}>●</span>
                    <span style={{ ...styles.dot, animationDelay: '0.2s' }}>●</span>
                    <span style={{ ...styles.dot, animationDelay: '0.4s' }}>●</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} style={styles.inputForm}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your order (e.g., '500 of product 55900')..."
              disabled={loading}
              style={styles.input}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                ...styles.sendButton,
                ...(loading || !input.trim() ? styles.sendButtonDisabled : {}),
              }}
            >
              Send
            </button>
          </form>
        </div>

        {/* Options Panel */}
        {showOptionsPanel && (
          <div style={styles.optionsPanel}>
            <div style={styles.optionsPanelHeader}>
              <h2 style={styles.optionsPanelTitle}>Order Options</h2>
              {productInfo && (
                <div style={styles.productInfoBox}>
                  <div style={styles.productName}>{productInfo.productName}</div>
                  <div style={styles.productDetails}>
                    Product #{productInfo.productId} • Qty: {productInfo.quantity}
                  </div>
                </div>
              )}
            </div>

            <div style={styles.optionsContent}>
              {/* Colors Section */}
              <OptionSection
                title="Color"
                required={requiredFields?.color}
                options={availableOptions.colors}
                onSelect={(opt) => handleOptionSelect('partId', opt.partId)}
                getLabel={(opt) => opt.name}
                getKey={(opt) => opt.partId}
                isSelected={(opt) => opt.selected}
                disabled={loading}
              />

              {/* Decoration Methods Section */}
              <OptionSection
                title="Decoration Method"
                required={requiredFields?.decorationMethod}
                options={availableOptions.decorationMethods}
                onSelect={(opt) => handleOptionSelect('decorationMethod', opt.name)}
                getLabel={(opt) => opt.name}
                getKey={(opt) => opt.id}
                isSelected={(opt) => opt.selected}
                disabled={loading}
              />

              {/* Decoration Locations Section */}
              <OptionSection
                title="Location"
                required={requiredFields?.decorationLocation}
                options={availableOptions.decorationLocations}
                onSelect={(opt) => handleOptionSelect('decorationLocation', opt.name)}
                getLabel={(opt) => opt.name}
                getKey={(opt) => opt.id}
                isSelected={(opt) => opt.selected}
                disabled={loading}
              />

              {/* Decoration Colors Section */}
              {availableOptions.decorationColors.max > 1 && (
                <div style={styles.optionSection}>
                  <div style={styles.optionSectionHeader}>
                    <span style={styles.optionSectionTitle}>Imprint Colors</span>
                    <span style={styles.optionalBadge}>Optional</span>
                  </div>
                  <div style={styles.colorCountSelector}>
                    {Array.from({ length: availableOptions.decorationColors.max }, (_, i) => i + 1).map(num => (
                      <button
                        key={num}
                        onClick={() => handleOptionSelect('decorationColors', num)}
                        disabled={loading}
                        style={{
                          ...styles.colorCountButton,
                          ...(availableOptions.decorationColors.selected === num ? styles.colorCountButtonSelected : {}),
                          ...(loading ? styles.optionButtonDisabled : {}),
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface OptionSectionProps<T> {
  title: string;
  required?: boolean;
  options: T[];
  onSelect: (option: T) => void;
  getLabel: (option: T) => string;
  getKey: (option: T) => string;
  isSelected: (option: T) => boolean;
  disabled: boolean;
}

function OptionSection<T>({
  title,
  required,
  options,
  onSelect,
  getLabel,
  getKey,
  isSelected,
  disabled,
}: OptionSectionProps<T>) {
  const hasSelection = options.some(isSelected);

  return (
    <div style={styles.optionSection}>
      <div style={styles.optionSectionHeader}>
        <span style={styles.optionSectionTitle}>{title}</span>
        {required && !hasSelection ? (
          <span style={styles.requiredBadge}>Required</span>
        ) : hasSelection ? (
          <span style={styles.selectedBadge}>✓</span>
        ) : (
          <span style={styles.optionalBadge}>Optional</span>
        )}
      </div>
      <div style={styles.optionButtons}>
        {options.length === 0 ? (
          <span style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
            No options available
          </span>
        ) : (
          options.map(opt => (
            <button
              key={getKey(opt)}
              onClick={() => onSelect(opt)}
              disabled={disabled}
              style={{
                ...styles.optionButton,
                ...(isSelected(opt) ? styles.optionButtonSelected : {}),
                ...(disabled ? styles.optionButtonDisabled : {}),
              }}
            >
              {getLabel(opt)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function LineItemDisplay({ lineItem }: { lineItem: OrderLineItem }) {
  return (
    <div style={styles.lineItem}>
      <div style={styles.lineItemHeader}>
        <span style={styles.lineItemTitle}>{lineItem.productName}</span>
        <span style={styles.lineItemPartId}>{lineItem.partId}</span>
      </div>
      <div style={styles.lineItemDesc}>{lineItem.description}</div>

      <table style={styles.lineItemTable}>
        <tbody>
          <tr>
            <td style={styles.lineItemLabel}>Quantity</td>
            <td style={styles.lineItemValue}>{lineItem.quantity}</td>
          </tr>
          <tr>
            <td style={styles.lineItemLabel}>Unit Price</td>
            <td style={styles.lineItemValue}>${lineItem.unitPrice.toFixed(2)}</td>
          </tr>
          <tr style={styles.lineItemSubtotal}>
            <td style={styles.lineItemLabel}>Product Subtotal</td>
            <td style={styles.lineItemValue}>${lineItem.extendedPrice.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {lineItem.decorationMethod && (
        <div style={styles.decorationInfo}>
          <div style={styles.decorationTitle}>Decoration</div>
          <div style={styles.decorationDetails}>
            {lineItem.decorationMethod} @ {lineItem.decorationLocation}
            {lineItem.decorationColors && lineItem.decorationColors > 1 && (
              <span> ({lineItem.decorationColors} colors)</span>
            )}
          </div>
        </div>
      )}

      {lineItem.charges.length > 0 && (
        <div style={styles.chargesSection}>
          <div style={styles.chargesTitle}>Decoration Charges</div>
          <table style={styles.lineItemTable}>
            <tbody>
              {lineItem.charges.map((charge, idx) => (
                <tr key={idx}>
                  <td style={styles.lineItemLabel}>{charge.name}</td>
                  <td style={styles.lineItemValue}>${charge.extendedPrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.totalSection}>
        <span style={styles.totalLabel}>TOTAL</span>
        <span style={styles.totalValue}>${lineItem.totalWithCharges.toFixed(2)}</span>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  debugPanel: {
    flex: '0 0 350px',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: '1px solid #333',
  },
  debugPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
  },
  debugPanelTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#cccccc',
  },
  clearDebugButton: {
    padding: '4px 12px',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  debugContent: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  debugEmpty: {
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  },
  debugEntry: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#2d2d2d',
    borderRadius: '6px',
    border: '1px solid #404040',
  },
  debugEntryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  debugOperation: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#569cd6',
  },
  debugTimestamp: {
    fontSize: '11px',
    color: '#666',
  },
  debugError: {
    padding: '8px',
    backgroundColor: '#5a1d1d',
    color: '#f48771',
    borderRadius: '4px',
    fontSize: '12px',
    marginBottom: '8px',
  },
  debugSection: {
    marginTop: '8px',
  },
  debugSectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    marginBottom: '4px',
    textTransform: 'uppercase',
  },
  debugXml: {
    margin: 0,
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    fontSize: '10px',
    lineHeight: 1.4,
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    color: '#ce9178',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#1e293b',
    color: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    opacity: 0.8,
  },
  resetButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  chatArea: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderRight: '1px solid #e2e8f0',
  },
  messagesContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },
  messageRow: {
    display: 'flex',
    marginBottom: '12px',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  userMessage: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderBottomRightRadius: '4px',
  },
  assistantMessage: {
    backgroundColor: 'white',
    color: '#1e293b',
    borderBottomLeftRadius: '4px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  loadingDots: {
    display: 'flex',
    gap: '4px',
  },
  dot: {
    opacity: 0.4,
    animation: 'pulse 1s infinite',
  },
  inputForm: {
    display: 'flex',
    gap: '8px',
    padding: '16px 20px',
    backgroundColor: 'white',
    borderTop: '1px solid #e2e8f0',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  sendButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'background-color 0.2s',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
    cursor: 'not-allowed',
  },
  optionsPanel: {
    flex: '0 0 340px',
    backgroundColor: 'white',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  optionsPanelHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  optionsPanelTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  productInfoBox: {
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  productName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '4px',
  },
  productDetails: {
    fontSize: '12px',
    color: '#64748b',
  },
  optionsContent: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px',
  },
  optionSection: {
    marginBottom: '20px',
  },
  optionSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  optionSectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  requiredBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  selectedBadge: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  optionalBadge: {
    fontSize: '11px',
    color: '#64748b',
  },
  optionButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  optionButton: {
    padding: '8px 14px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.15s',
  },
  optionButtonSelected: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
  },
  optionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  colorCountSelector: {
    display: 'flex',
    gap: '8px',
  },
  colorCountButton: {
    width: '40px',
    height: '40px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  colorCountButtonSelected: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
  },
  lineItemContainer: {
    marginTop: '12px',
  },
  lineItem: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
  lineItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  },
  lineItemTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
  },
  lineItemPartId: {
    fontSize: '12px',
    color: '#64748b',
    backgroundColor: '#e2e8f0',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  lineItemDesc: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '12px',
  },
  lineItemTable: {
    width: '100%',
    fontSize: '13px',
    borderCollapse: 'collapse',
  },
  lineItemLabel: {
    color: '#64748b',
    padding: '4px 0',
  },
  lineItemValue: {
    textAlign: 'right' as const,
    color: '#1e293b',
    fontWeight: 500,
    padding: '4px 0',
  },
  lineItemSubtotal: {
    borderTop: '1px solid #e2e8f0',
  },
  decorationInfo: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0',
  },
  decorationTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '4px',
  },
  decorationDetails: {
    fontSize: '13px',
    color: '#1e293b',
  },
  chargesSection: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0',
  },
  chargesTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '8px',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '2px solid #1e293b',
  },
  totalLabel: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1e293b',
  },
  totalValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1e293b',
  },
};
