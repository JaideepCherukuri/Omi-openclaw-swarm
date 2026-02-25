"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { 
  Terminal, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info,
  Clock,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Bot,
  Zap,
  Play,
  PauseCircle,
  XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { customFetch } from "@/api/mutator";

// Types enriched with more detail
interface AgentLog {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  event_type: "heartbeat" | "task_start" | "task_complete" | "task_error" | "think" | "tool_call" | "status_change" | "system";
  level: "info" | "success" | "warning" | "error";
  message: string;
  details?: string;
  task_id?: string;
  task_title?: string;
  duration_ms?: number;
  tokens_used?: { input: number; output: number };
}

// Mock enriched data - replace with real API
function generateMockAgentLogs(): AgentLog[] {
  const agents = [
    { id: "backend", name: "Backend Engineer", color: "bg-blue-500" },
    { id: "frontend", name: "Frontend Engineer", color: "bg-purple-500" },
    { id: "devops", name: "DevOps Engineer", color: "bg-green-500" },
    { id: "qa", name: "QA Engineer", color: "bg-amber-500" },
    { id: "security", name: "Security Auditor", color: "bg-red-500" },
    { id: "docs", name: "Technical Writer", color: "bg-cyan-500" },
  ];

  const events: AgentLog[] = [
    // Backend Engineer - Active task
    {
      id: "1",
      timestamp: new Date(Date.now() - 1000).toISOString(),
      agent_id: "backend",
      agent_name: "Backend Engineer",
      event_type: "task_start",
      level: "info",
      message: "Starting task: Fix migration head conflict",
      details: "Task ID: d4e8f1a9b2c3 | Board: Mission Control | Priority: High",
      task_id: "task-1",
      task_title: "Fix migration head conflict",
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 30000).toISOString(),
      agent_id: "backend",
      agent_name: "Backend Engineer",
      event_type: "think",
      level: "info",
      message: "Analyzing migration dependencies...",
      details: "Identified two conflicting heads: b497b348ebb4 and d4e8f1a9b2c3",
      duration_ms: 2500,
    },
    {
      id: "3",
      timestamp: new Date(Date.now() - 120000).toISOString(),
      agent_id: "backend",
      agent_name: "Backend Engineer",
      event_type: "tool_call",
      level: "success",
      message: "Executed: alembic revision fix",
      details: "Changed down_revision from c9d7e9b6a4f2 to b497b348ebb4",
      duration_ms: 500,
    },
    // Frontend Engineer - Completed task
    {
      id: "4",
      timestamp: new Date(Date.now() - 180000).toISOString(),
      agent_id: "frontend",
      agent_name: "Frontend Engineer",
      event_type: "task_complete",
      level: "success",
      message: "Completed: Dark theme implementation",
      details: "All components updated with dark mode support. Build passing.",
      task_id: "task-2",
      task_title: "Dark theme implementation",
      tokens_used: { input: 256000, output: 4500 },
    },
    // DevOps - Error
    {
      id: "5",
      timestamp: new Date(Date.now() - 300000).toISOString(),
      agent_id: "devops",
      agent_name: "DevOps Engineer",
      event_type: "task_error",
      level: "error",
      message: "Deployment failed: Railway token expired",
      details: "Token validation failed. Need new token from Railway dashboard.",
      task_id: "task-3",
      task_title: "Set up Railway deployment for Solom",
    },
    // System events
    {
      id: "6",
      timestamp: new Date(Date.now() - 600000).toISOString(),
      agent_id: "system",
      agent_name: "System",
      event_type: "status_change",
      level: "warning",
      message: "Worker service crashed: rq worker name collision",
      details: "Redis key 'rq:worker:default' already exists from previous container",
    },
    // Heartbeat examples
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `hb-${i}`,
      timestamp: new Date(Date.now() - (i + 1) * 600000).toISOString(),
      agent_id: ["backend", "frontend", "devops", "qa", "security"][i],
      agent_name: ["Backend Engineer", "Frontend Engineer", "DevOps Engineer", "QA Engineer", "Security Auditor"][i],
      event_type: "heartbeat" as const,
      level: "info" as const,
      message: "Heartbeat: No tasks assigned",
      details: `Runtime: ${30 + i * 10}s | Tokens: ~60k`,
    })),
  ];

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// Event type badge config
const eventTypeConfig: Record<string, { icon: any; label: string; color: string }> = {
  heartbeat: { icon: Activity, label: "Heartbeat", color: "bg-slate-500" },
  task_start: { icon: Play, label: "Task Start", color: "bg-blue-500" },
  task_complete: { icon: CheckCircle2, label: "Complete", color: "bg-green-500" },
  task_error: { icon: XCircle, label: "Error", color: "bg-red-500" },
  think: { icon: Zap, label: "Thinking", color: "bg-purple-500" },
  tool_call: { icon: Terminal, label: "Tool Call", color: "bg-cyan-500" },
  status_change: { icon: Activity, label: "Status", color: "bg-amber-500" },
  system: { icon: Bot, label: "System", color: "bg-slate-600" },
};

// Level badge config
const levelConfig: Record<string, { icon: any; color: string; label: string }> = {
  info: { icon: Info, color: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "INFO" },
  success: { icon: CheckCircle2, color: "bg-green-500/10 text-green-500 border-green-500/20", label: "SUCCESS" },
  warning: { icon: AlertTriangle, color: "bg-amber-500/10 text-amber-500 border-amber-500/20", label: "WARN" },
  error: { icon: AlertCircle, color: "bg-red-500/10 text-red-500 border-red-500/20", label: "ERROR" },
};

function AgentAvatar({ name, color }: { name: string; color?: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  
  return (
    <Avatar className={cn("h-8 w-8 border-2 border-background", color)}>
      <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-slate-500 to-slate-600 text-white">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function TimeAgo({ timestamp }: { timestamp: string }) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let text = "";
  if (diffSecs < 60) text = "just now";
  else if (diffMins < 60) text = `${diffMins}m ago`;
  else if (diffHours < 24) text = `${diffHours}h ago`;
  else text = `${diffDays}d ago`;

  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {text}
    </span>
  );
}

function LogEntry({ log, expanded, onToggle }: { log: AgentLog; expanded: boolean; onToggle: () => void }) {
  const eventConfig = eventTypeConfig[log.event_type] || eventTypeConfig.system;
  const levelCfg = levelConfig[log.level] || levelConfig.info;
  const EventIcon = eventConfig.icon;
  const LevelIcon = levelCfg.icon;

  return (
    <div className="group relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
      
      <div className={cn(
        "relative pl-10 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
        expanded && "bg-muted/30"
      )} onClick={onToggle}>
        {/* Timeline dot */}
        <div className={cn(
          "absolute left-2 top-4 w-4 h-4 rounded-full border-2 border-background z-10 flex items-center justify-center",
          eventConfig.color,
          expanded && "ring-2 ring-offset-1 ring-offset-background",
          expanded && log.level === "error" && "ring-red-500",
          expanded && log.level === "success" && "ring-green-500",
          expanded && log.level === "warning" && "ring-amber-500"
        )}>
          <EventIcon className="h-2.5 w-2.5 text-white" />
        </div>

        {/* Content */}
        <div className="space-y-2">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <AgentAvatar name={log.agent_name} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{log.agent_name}</span>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 h-5", levelCfg.color)}>
                  <LevelIcon className="h-3 w-3 mr-1" />
                  {levelCfg.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {eventConfig.label}
                </Badge>
                <TimeAgo timestamp={log.timestamp} />
              </div>
              
              <p className="text-sm text-foreground mt-1">{log.message}</p>
            </div>

            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          {/* Expanded details */}
          {expanded && log.details && (
            <div className="ml-11 p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{log.details}</p>
              
              {log.task_title && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Task: {log.task_title}
                  </Badge>
                </div>
              )}
              
              {(log.duration_ms || log.tokens_used) && (
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  {log.duration_ms && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {log.duration_ms}ms
                    </span>
                  )}
                  {log.tokens_used && (
                    <span>
                      Tokens: {log.tokens_used.input.toLocaleString()} in / {log.tokens_used.output.toLocaleString()} out
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentActivityFeed() {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch logs from API
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const params = new URLSearchParams();
        if (filterAgent) params.append("agent_id", filterAgent);
        if (filterLevel) params.append("level", filterLevel);
        params.append("limit", "50");
        params.append("hours", "24");
        
        const response = await customFetch<{ logs: AgentLog[]; count: number }>(
          `/api/v1/serayah/agent-logs?${params.toString()}`,
          { method: "GET" }
        );
        
        if (response.status === 200 && response.data?.logs) {
          setLogs(response.data.logs);
        }
      } catch (err) {
        console.error("Failed to fetch agent logs:", err);
        // Fallback to mock data on error
        setLogs(generateMockAgentLogs());
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchLogs();
  }, [filterAgent, filterLevel]);

  // Auto-refresh (poll every 10 seconds)
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);

    return () => clearInterval(interval);
  }, [isPaused, filterAgent, filterLevel]);

  const filteredLogs = logs.filter((log) => {
    if (filterAgent && log.agent_id !== filterAgent) return false;
    if (filterLevel && log.level !== filterLevel) return false;
    return true;
  });

  const uniqueAgents = Array.from(new Set(logs.map((l) => l.agent_id)));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Agent Activity</CardTitle>
              <p className="text-xs text-muted-foreground">
                {filteredLogs.length} events • {isPaused ? "Paused" : "Live"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Filters:</span>
          </div>
          
          <Button
            variant={filterAgent === null ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setFilterAgent(null)}
          >
            All
          </Button>
          
          {uniqueAgents.map((agentId) => {
            const agent = logs.find((l) => l.agent_id === agentId);
            if (!agent) return null;
            return (
              <Button
                key={agentId}
                variant={filterAgent === agentId ? "default" : "outline"}
                size="sm"
                className="h-6 text-xs"
                onClick={() => setFilterAgent(filterAgent === agentId ? null : agentId)}
              >
                {agent.agent_name}
              </Button>
            );
          })}
          
          <div className="w-px h-5 bg-border mx-1" />
          
          {["info", "success", "warning", "error"].map((level) => (
            <Button
              key={level}
              variant={filterLevel === level ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-6 text-xs capitalize",
                filterLevel === level && level === "error" && "bg-red-500 hover:bg-red-600",
                filterLevel === level && level === "warning" && "bg-amber-500 hover:bg-amber-600",
                filterLevel === level && level === "success" && "bg-green-500 hover:bg-green-600",
              )}
              onClick={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              {level}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <Activity className="h-12 w-12 mb-3 opacity-30" />
              <p>No activity found</p>
              <p className="text-xs mt-1">Try adjusting filters</p>
            </div>
          ) : (
            <div className="py-2">
              {filteredLogs.map((log) => (
                <LogEntry
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
