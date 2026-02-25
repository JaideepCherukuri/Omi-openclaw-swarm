"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Crown, Loader2, Activity, Bot, CheckCircle2, Clock, AlertCircle, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SerayahMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface SerayahStatus {
  status: "online" | "offline" | "busy" | "working";
  currentTask?: {
    id: string;
    title: string;
    status: string;
  };
  lastSeen?: Date;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting" | "poll-mode";

// Gateway URLs from env
// For Railway: Set NEXT_PUBLIC_GATEWAY_WS_URL to public domain (e.g., wss://your-app.railway.app/gateway)
// and NEXT_PUBLIC_MC_API_URL to your Mission Control API (e.g., https://your-api.railway.app)
const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || "";
const MC_API_URL = process.env.NEXT_PUBLIC_MC_API_URL || "";

// Polling configuration
const POLL_INTERVAL = 10000; // 10 seconds
const MESSAGE_POLL_INTERVAL = 5000; // 5 seconds for messages in poll mode
const MAX_WS_RECONNECT_ATTEMPTS = 3;

export function SerayahChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SerayahMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [serayahStatus, setSerayahStatus] = useState<SerayahStatus>({ status: "offline" });
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [useHttpFallback, setUseHttpFallback] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagePollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string>("0");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Create timeout signal for fetch (browser-compatible)
  const createTimeoutSignal = (ms: number): AbortSignal => {
    if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === "function") {
      return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(ms);
    }
    // Fallback for browsers without AbortSignal.timeout
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };

  // Health check for HTTP fallback
  const checkHealth = useCallback(async (): Promise<boolean> => {
    if (!MC_API_URL) return false;
    try {
      const response = await fetch(`${MC_API_URL}/health`, { 
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: createTimeoutSignal(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Fetch Serayah's status from MC API
  const fetchSerayahStatus = useCallback(async () => {
    if (!MC_API_URL) return;
    try {
      const response = await fetch(`${MC_API_URL}/api/v1/agents?name=Serayah`, {
        signal: createTimeoutSignal(10000)
      });
      if (response.ok) {
        const data = await response.json();
        const agents = data.items || [];
        const serayahAgent = agents.find((a: { name: string; is_gateway_main?: boolean }) => 
          a.name?.toLowerCase().includes("serayah") || a.is_gateway_main
        );
        
        if (serayahAgent) {
          setSerayahStatus({
            status: mapAgentStatus(serayahAgent.status),
            currentTask: serayahAgent.current_task,
            lastSeen: serayahAgent.last_seen_at ? new Date(serayahAgent.last_seen_at) : undefined,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch Serayah status:", error);
    }
  }, []);

  // Poll for new messages via HTTP (fallback mode)
  const pollMessages = useCallback(async () => {
    if (!MC_API_URL || !isOpen) return;
    try {
      const response = await fetch(
        `${MC_API_URL}/api/v1/messages?session=agent:serayah:main&after=${lastMessageIdRef.current}`,
        { signal: createTimeoutSignal(10000) }
      );
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.items || [];
        
        if (newMessages.length > 0) {
          // Update last message ID
          const lastMsg = newMessages[newMessages.length - 1];
          lastMessageIdRef.current = lastMsg.id || lastMessageIdRef.current;
          
          // Add new messages to chat
          newMessages.forEach((msg: { id: string; content: string; role: string; created_at: string }) => {
            if (msg.role === "assistant") {
              const assistantMessage: SerayahMessage = {
                id: msg.id,
                role: "assistant",
                content: msg.content,
                timestamp: new Date(msg.created_at),
              };
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, assistantMessage];
              });
            }
          });
        }
      }
    } catch (error) {
      console.error("Failed to poll messages:", error);
    }
  }, [isOpen]);

  // Send message via HTTP POST (fallback mode)
  const sendMessageViaHttp = useCallback(async (content: string): Promise<boolean> => {
    if (!MC_API_URL) return false;
    try {
      const response = await fetch(`${MC_API_URL}/api/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: "agent:serayah:main",
          content,
          role: "user",
        }),
        signal: createTimeoutSignal(30000)
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to send message via HTTP:", error);
      return false;
    }
  }, []);

  const mapAgentStatus = (status: string): SerayahStatus["status"] => {
    switch (status) {
      case "online":
      case "active":
        return "online";
      case "working":
      case "busy":
        return "busy";
      case "offline":
      case "provisioning":
        return "offline";
      default:
        return "offline";
    }
  };

  // Start HTTP polling as fallback
  const startHttpFallback = useCallback(async () => {
    if (useHttpFallback) return;
    
    const healthy = await checkHealth();
    if (healthy) {
      setUseHttpFallback(true);
      setConnectionState("poll-mode");
      
      // Start polling intervals
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (messagePollIntervalRef.current) clearInterval(messagePollIntervalRef.current);
      
      pollIntervalRef.current = setInterval(fetchSerayahStatus, POLL_INTERVAL);
      messagePollIntervalRef.current = setInterval(pollMessages, MESSAGE_POLL_INTERVAL);
      
      // Initial fetch
      fetchSerayahStatus();
      pollMessages();
    }
  }, [checkHealth, fetchSerayahStatus, pollMessages, useHttpFallback]);

  // Stop HTTP polling
  const stopHttpFallback = useCallback(() => {
    setUseHttpFallback(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (messagePollIntervalRef.current) {
      clearInterval(messagePollIntervalRef.current);
      messagePollIntervalRef.current = null;
    }
  }, []);

  // Connect to gateway WebSocket with retry logic
  const connect = useCallback(() => {
    // Don't connect if no WebSocket URL configured
    if (!GATEWAY_WS_URL) {
      console.warn("No WebSocket URL configured, using HTTP fallback");
      startHttpFallback();
      return;
    }

    // Don't connect if already connected or reconnecting
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    
    // Stop any existing fallback
    stopHttpFallback();
    
    const currentAttempt = reconnectAttempt;
    setConnectionState(currentAttempt > 0 ? "reconnecting" : "connecting");
    
    try {
      // Ensure we're using wss:// for production (browsers require secure ws for secure pages)
      let wsUrl = GATEWAY_WS_URL;
      if (typeof window !== "undefined" && window.location.protocol === "https:" && wsUrl.startsWith("ws://")) {
        wsUrl = wsUrl.replace("ws://", "wss://");
      }
      
      // Add session parameter
      const fullWsUrl = wsUrl.includes("?") 
        ? `${wsUrl}&session=agent:serayah:main` 
        : `${wsUrl}?session=agent:serayah:main`;
      
      const ws = new WebSocket(fullWsUrl);
      
      ws.onopen = () => {
        setConnectionState("connected");
        setReconnectAttempt(0);
        setUseHttpFallback(false);
        setSerayahStatus(prev => ({ ...prev, status: "online" }));
        
        // Send connect message
        ws.send(JSON.stringify({
          type: "connect",
          role: "ui",
          client: { id: "mc-serayah-chat", version: "1.0.0" }
        }));
        
        // Send any pending message
        if (pendingMessageRef.current) {
          ws.send(JSON.stringify({
            type: "message",
            content: pendingMessageRef.current,
          }));
          pendingMessageRef.current = null;
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsMessage(data);
        } catch {
          // Handle plain text messages
          const assistantMessage: SerayahMessage = {
            id: Date.now().toString(),
            role: "assistant",
            content: event.data,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      };
      
      ws.onclose = (event) => {
        const wasConnected = connectionState === "connected";
        setConnectionState("disconnected");
        setSerayahStatus(prev => ({ ...prev, status: "offline" }));
        
        // Attempt reconnection if chat is open
        if (isOpen) {
          if (reconnectAttempt < MAX_WS_RECONNECT_ATTEMPTS) {
            setReconnectAttempt(prev => prev + 1);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isOpen) {
                connect();
              }
            }, 3000 * (reconnectAttempt + 1)); // Exponential backoff
          } else {
            // Fall back to HTTP polling after max attempts
            startHttpFallback();
          }
        }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket connection error:", error);
        ws.close(); // Trigger onclose for reconnection logic
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setConnectionState("disconnected");
      setReconnectAttempt(prev => prev + 1);
      
      // Try HTTP fallback after error
      if (reconnectAttempt >= MAX_WS_RECONNECT_ATTEMPTS - 1) {
        startHttpFallback();
      }
    }
  }, [connectionState, isOpen, reconnectAttempt, startHttpFallback, stopHttpFallback]);

  // Handle WebSocket messages
  const handleWsMessage = useCallback((data: unknown) => {
    if (typeof data !== "object" || data === null) return;
    const msg = data as Record<string, unknown>;
    
    // Handle different message types
    if (msg.type === "event") {
      const ev = msg.event as string;
      const payload = msg.payload as Record<string, unknown> | undefined;
      
      if (ev === "chat" && payload?.message) {
        const assistantMessage: SerayahMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: String(payload.message),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else if (ev === "presence" && payload?.agent) {
        const agent = payload.agent as Record<string, unknown>;
        setSerayahStatus({
          status: mapAgentStatus(String(agent.status)),
          currentTask: agent.current_task as SerayahStatus["currentTask"],
          lastSeen: new Date(),
        });
      }
    } else if (msg.type === "message" && msg.content) {
      const assistantMessage: SerayahMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: String(msg.content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } else if (msg.type === "res" && msg.result) {
      const content = typeof msg.result === "string" 
        ? msg.result 
        : JSON.stringify(msg.result, null, 2);
      const assistantMessage: SerayahMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }
  }, []);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopHttpFallback();
    setConnectionState("disconnected");
    setReconnectAttempt(0);
  }, [stopHttpFallback]);

  // Force WebSocket reconnect
  const forceReconnect = useCallback(() => {
    disconnect();
    setReconnectAttempt(0);
    setUseHttpFallback(false);
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Effect: Connect when chat opens
  useEffect(() => {
    if (isOpen) {
      fetchSerayahStatus();
      if (connectionState === "disconnected" && !useHttpFallback) {
        connect();
      }
    }
    return () => {
      if (!isOpen) {
        disconnect();
      }
    };
  }, [isOpen, connect, disconnect, fetchSerayahStatus, connectionState, useHttpFallback]);

  // Effect: Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Effect: Poll status when in fallback mode
  useEffect(() => {
    if (!isOpen || !useHttpFallback) return;
    
    const interval = setInterval(fetchSerayahStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isOpen, useHttpFallback, fetchSerayahStatus]);

  const sendMessage = useCallback(async () => {
    if (!input.trim()) return;
    
    const content = input.trim();
    const userMessage: SerayahMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    
    // Try WebSocket first
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message",
        content,
      }));
      return;
    }
    
    // WebSocket not available - try HTTP fallback
    if (useHttpFallback) {
      const sent = await sendMessageViaHttp(content);
      if (!sent) {
        const systemMessage: SerayahMessage = {
          id: (Date.now() + 1).toString(),
          role: "system",
          content: "⚠️ Failed to send message. Service may be temporarily unavailable.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMessage]);
      }
      return;
    }
    
    // Store as pending and try to connect
    pendingMessageRef.current = content;
    const systemMessage: SerayahMessage = {
      id: (Date.now() + 1).toString(),
      role: "system",
      content: "⏳ Connecting to Serayah...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, systemMessage]);
    connect();
  }, [input, connect, useHttpFallback, sendMessageViaHttp]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Initial greeting from Serayah
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: "👋 Hello! I'm Serayah, your Mission Control assistant.\n\nI can help you with:\n• Creating and assigning tasks\n• Checking on agent status\n• Managing board workflows\n• Answering questions about your operations\n\nHow can I help you today?",
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, messages.length]);

  const statusIndicator = {
    online: { color: "bg-green-400", label: "Online" },
    busy: { color: "bg-amber-400", label: "Working" },
    offline: { color: "bg-red-400", label: "Offline" },
    working: { color: "bg-blue-400", label: "Working" },
  };

  const connectionStateConfig = {
    connected: { color: "bg-green-400", icon: Wifi, label: "Connected", showReconnect: false },
    connecting: { color: "bg-amber-400", icon: Loader2, label: "Connecting...", showReconnect: false },
    reconnecting: { color: "bg-amber-400", icon: RefreshCcw, label: "Reconnecting...", showReconnect: false },
    disconnected: { color: "bg-red-400", icon: WifiOff, label: "Disconnected", showReconnect: true },
    "poll-mode": { color: "bg-blue-400", icon: Activity, label: "Poll Mode", showReconnect: true },
  };

  const currentConfig = connectionStateConfig[connectionState];
  const ConnectionIcon = currentConfig.icon;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
          "bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600",
          "text-white shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          isOpen && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="Open Serayah chat"
      >
        <Crown className="h-6 w-6" />
        {serayahStatus.status === "online" && (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-400 ring-2 ring-white" />
        )}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl transition-all duration-300",
          "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
          // Desktop: bottom-right corner
          "bottom-6 right-6 w-96 h-[36rem]",
          // Mobile: full-screen bottom sheet
          "max-md:bottom-0 max-md:right-0 max-md:left-0 max-md:w-full max-md:h-[70vh] max-md:rounded-b-none max-md:rounded-t-2xl",
          isOpen
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <Crown className="h-4 w-4 text-white" />
              <span 
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-violet-600",
                  statusIndicator[serayahStatus.status].color
                )} 
              />
            </div>
            <div>
              <h3 className="font-semibold text-white">Serayah</h3>
              <p className="text-xs text-white/70 flex items-center gap-1">
                {serayahStatus.status === "working" || serayahStatus.status === "busy" ? (
                  <>
                    <Activity className="h-3 w-3 animate-pulse" />
                    {serayahStatus.currentTask?.title || "Working on task..."}
                  </>
                ) : (
                  <>
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusIndicator[serayahStatus.status].color)} />
                    {statusIndicator[serayahStatus.status].label}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10"
              title={currentConfig.label}
            >
              <ConnectionIcon className={cn("h-2.5 w-2.5 text-white", connectionState === "connecting" && "animate-spin")} />
              <span className={cn("h-2 w-2 rounded-full", currentConfig.color)} />
            </div>
            {currentConfig.showReconnect && (
              <button
                onClick={forceReconnect}
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
                title="Reconnect"
                aria-label="Reconnect to WebSocket"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-violet-600 text-white rounded-br-md"
                    : message.role === "system"
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-bl-md"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-md"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick action buttons */}
        {messages.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 flex gap-2 flex-wrap">
            <QuickActionButton 
              onClick={() => setInput("What tasks are pending?")} 
              icon={<CheckCircle2 className="h-3 w-3" />}
            >
              Pending tasks
            </QuickActionButton>
            <QuickActionButton 
              onClick={() => setInput("What are you working on?")} 
              icon={<Bot className="h-3 w-3" />}
            >
              Status
            </QuickActionButton>
            <QuickActionButton 
              onClick={() => setInput("Create a new task: ")} 
              icon={<Clock className="h-3 w-3" />}
            >
              New task
            </QuickActionButton>
          </div>
        )}

        {/* Connection status banner for poll mode */}
        {connectionState === "poll-mode" && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Using fallback mode. Messages may be slower.
              <button 
                onClick={forceReconnect}
                className="underline hover:text-blue-800 dark:hover:text-blue-200 ml-auto"
              >
                Try WebSocket
              </button>
            </p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connectionState === "connected" || connectionState === "poll-mode" 
                ? "Type a message..." 
                : "Connecting..."}
              disabled={connectionState !== "connected" && connectionState !== "poll-mode"}
              className={cn(
                "flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm",
                "text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500",
                "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || (connectionState !== "connected" && connectionState !== "poll-mode")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                "bg-violet-600 hover:bg-violet-500 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
              )}
              aria-label="Send message"
            >
              {connectionState === "connecting" || connectionState === "reconnecting" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
          {connectionState === "disconnected" && (
            <button 
              onClick={forceReconnect}
              className="mt-2 text-xs text-center text-violet-600 hover:text-violet-500 w-full flex items-center justify-center gap-1"
            >
              <RefreshCcw className="h-3 w-3" />
              Click to reconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function QuickActionButton({ 
  children, 
  icon, 
  onClick 
}: { 
  children: React.ReactNode; 
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
    >
      {icon}
      {children}
    </button>
  );
}
