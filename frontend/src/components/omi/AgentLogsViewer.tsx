"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal, Download, Pause, Play, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { customFetch } from "@/api/mutator";

// Agent log type
interface AgentLog {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  task_id?: string;
  task_title?: string;
}

// API response type
interface LogsResponse {
  logs: AgentLog[];
  count: number;
}

// Wrapper type for customFetch response
interface FetchResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

// Format timestamp to readable time
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

// Log level colors
const levelColors: Record<string, { bg: string; text: string; border: string }> = {
  info: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  warn: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  error: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  debug: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
};

// Fetch logs from API
async function fetchLogs(
  agentId?: string,
  level?: string,
  limit: number = 100
): Promise<AgentLog[]> {
  const params = new URLSearchParams();
  if (agentId) params.append("agent_id", agentId);
  if (level) params.append("level", level);
  params.append("limit", limit.toString());
  params.append("hours", "24");
  
  const response = await customFetch<FetchResponse<LogsResponse>>(
    `/api/v1/omi/agent-logs?${params.toString()}`,
    { method: "GET" }
  );
  
  if (response.status !== 200) {
    throw new Error("Failed to fetch logs");
  }
  
  return response.data.logs;
}

// Clear logs via API
async function clearLogsApi(): Promise<void> {
  await customFetch("/api/v1/omi/agent-logs/clear", { method: "POST" });
}

// Single log entry component
function LogEntry({ log }: { log: AgentLog }) {
  const colors = levelColors[log.level] || levelColors.info;
  
  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-surface-muted/50 transition-colors font-mono text-sm">
      {/* Timestamp */}
      <span className="text-xs text-text-quiet shrink-0 w-[100px]">
        {formatTime(log.timestamp)}
      </span>
      
      {/* Agent badge */}
      <Badge 
        variant="outline" 
        className="shrink-0 text-[10px] px-1.5 py-0 h-5 border-border"
      >
        {log.agent_name}
      </Badge>
      
      {/* Level indicator */}
      <span className={cn(
        "shrink-0 w-14 text-[10px] font-semibold uppercase px-1.5 rounded border",
        colors.bg,
        colors.text,
        colors.border
      )}>
        {log.level}
      </span>
      
      {/* Message */}
      <div className="flex-1 min-w-0">
        <span className="text-text truncate block">
          {log.message}
        </span>
        {log.task_title && (
          <span className="text-text-muted text-xs">
            Task: {log.task_title}
          </span>
        )}
      </div>
    </div>
  );
}

// Main component
export function AgentLogsViewer({ className }: { className?: string }) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Fetch logs from API
  const loadLogs = async () => {
    try {
      const data = await fetchLogs(
        filterAgent || undefined,
        filterLevel || undefined
      );
      setLogs(data);
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initial load
  useEffect(() => {
    loadLogs();
  }, [filterAgent, filterLevel]);
  
  // Live polling every 5 seconds
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      loadLogs();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPaused, filterAgent, filterLevel]);
  
  // Simulate live updates
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setLogs(prev => {
        const newLog: AgentLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          agent_id: "1",
          agent_name: "Backend Engineer",
          level: "info",
          message: "Heartbeat cycle completed",
        };
        return [newLog, ...prev].slice(0, 100); // Keep last 100
      });
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isPaused]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);
  
  const filteredLogs = logs.filter(log => {
    if (filterLevel && log.level !== filterLevel) return false;
    if (filterAgent && log.agent_name !== filterAgent) return false;
    return true;
  });
  
  const agents = Array.from(new Set(logs.map(l => l.agent_name)));
  const levelCounts = {
    info: logs.filter(l => l.level === "info").length,
    warn: logs.filter(l => l.level === "warn").length,
    error: logs.filter(l => l.level === "error").length,
    debug: logs.filter(l => l.level === "debug").length,
  };
  
  const handleDownload = () => {
    const content = logs.map(l => 
      `[${formatTime(l.timestamp)}] [${l.agent_name}] [${l.level.toUpperCase()}] ${l.message}`
    ).join("\n");
    
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-logs-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
  };
  
  const handleClear = async () => {
    try {
      await clearLogsApi();
      setLogs([]);
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };
  
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent-soft flex items-center justify-center">
              <Terminal className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-strong">Agent Logs</h3>
              <p className="text-xs text-muted">
                {filteredLogs.length} entries • {levelCounts.error > 0 && (
                  <span className="text-danger">{levelCounts.error} errors</span>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Level filters */}
            <div className="flex items-center gap-1">
              {["info", "warn", "error", "debug"].map(level => (
                <Button
                  key={level}
                  variant={filterLevel === level ? "primary" : "outline"}
                  size="sm"
                  className={cn(
                    "text-[10px] h-7 px-2 capitalize",
                    filterLevel === level && level === "error" && "bg-danger text-white",
                    filterLevel === level && level === "warn" && "bg-warning text-white",
                  )}
                  onClick={() => setFilterLevel(filterLevel === level ? null : level)}
                >
                  {level} ({levelCounts[level as keyof typeof levelCounts]})
                </Button>
              ))}
            </div>
            
            <div className="h-6 w-px bg-border mx-1" />
            
            {/* Controls */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              title="Download logs"
            >
              <Download className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-danger hover:text-danger"
              onClick={handleClear}
              title="Clear logs"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={loadLogs}
              title="Refresh"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Agent filter */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-muted">Filter by agent:</span>
          {agents.map(agent => (
            <Button
              key={agent}
              variant={filterAgent === agent ? "primary" : "outline"}
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setFilterAgent(filterAgent === agent ? null : agent)}
            >
              {agent}
            </Button>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 min-h-[400px]">
        <div 
          ref={scrollRef}
          className="h-[400px] overflow-y-auto surface-muted scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
          onScroll={(e) => {
            const target = e.currentTarget;
            setAutoScroll(target.scrollTop < 50);
          }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Terminal className="h-12 w-12 mb-3 opacity-30" />
              <p>No logs available</p>
              {isPaused && <p className="text-xs mt-1">(Live updates paused)</p>}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLogs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
        
        {/* Scroll indicator */}
        {!autoScroll && (
          <div className="absolute bottom-4 right-4">
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg"
              onClick={() => {
                setAutoScroll(true);
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Scroll to latest
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
