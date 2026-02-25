"use client";

import { cn } from "@/lib/utils";
import {
  Bot,
  Clock,
  Activity,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";

type AgentStatus = "online" | "busy" | "offline" | "error" | "unknown";

type AgentCardProps = {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeenAt?: string | null;
  currentTask?: string | null;
  boardName?: string | null;
  openclawSessionId?: string | null;
  onClick?: () => void;
  onOpen?: () => void;
  className?: string;
};

const STATUS_CONFIG: Record<
  AgentStatus,
  { bg: string; text: string; glow: string }
> = {
  online: {
    bg: "bg-emerald-500",
    text: "Online",
    glow: "shadow-[0_0_12px_rgba(16,185,129,0.5)]",
  },
  busy: {
    bg: "bg-amber-500",
    text: "Busy",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
  },
  offline: {
    bg: "bg-slate-400 dark:bg-slate-500",
    text: "Offline",
    glow: "",
  },
  error: {
    bg: "bg-red-500",
    text: "Error",
    glow: "shadow-[0_0_12px_rgba(239,68,68,0.5)]",
  },
  unknown: {
    bg: "bg-slate-400",
    text: "Unknown",
    glow: "",
  },
};

function formatLastSeen(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function AgentCard({
  name,
  status,
  lastSeenAt,
  currentTask,
  boardName,
  openclawSessionId,
  onClick,
  onOpen,
  className,
}: AgentCardProps) {
  const statusConfig = STATUS_CONFIG[status];
  const isActive = status === "online" || status === "busy";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/50",
        "bg-white dark:bg-slate-900/50 p-4",
        "transition-all duration-200",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-black/20",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {/* Subtle gradient overlay for active agents */}
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-blue-500/5 dark:to-blue-500/10" />
      )}
      
      <div className="relative flex items-start justify-between">
        {/* Left side: Agent info */}
        <div className="flex items-start gap-3">
          {/* Robot icon with status indicator */}
          <div className="relative flex-shrink-0">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700",
                "group-hover:from-blue-50 group-hover:to-blue-100 dark:group-hover:from-blue-900/30 dark:group-hover:to-blue-800/30",
                "transition-colors duration-200",
              )}
            >
              <Bot className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            
            {/* Status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
              {isActive && (
                <span
                  className={cn(
                    "absolute h-3 w-3 rounded-full opacity-50",
                    statusConfig.bg,
                    "animate-ping",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative h-2.5 w-2.5 rounded-full",
                  statusConfig.bg,
                  statusConfig.glow,
                )}
              />
            </div>
          </div>

          {/* Name and task */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {name}
            </h3>
            
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  status === "online" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                  status === "busy" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  status === "offline" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                  status === "error" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  status === "unknown" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {statusConfig.text}
              </span>
              
              {boardName && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  • {boardName}
                </span>
              )}
            </div>

            {/* Current task */}
            {currentTask && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                {currentTask}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Actions & metadata */}
        <div className="flex flex-col items-end gap-2">
          {/* Open link */}
          {onOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            >
              <ExternalLink className="h-4 w-4 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400" />
            </button>
          )}
          
          {/* Last seen */}
          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" />
            <span>{formatLastSeen(lastSeenAt)}</span>
          </div>
        </div>
      </div>

      {/* Session indicator */}
      {openclawSessionId && isActive && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Activity className="h-3 w-3" />
          <span>Session active</span>
          <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}

/* Compact version for lists */
export function AgentCardCompact({
  name,
  status,
  lastSeenAt,
  boardName,
  onClick,
  className,
}: Omit<AgentCardProps, "currentTask" | "openclawSessionId" | "onOpen">) {
  const statusConfig = STATUS_CONFIG[status];
  const isActive = status === "online" || status === "busy";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700/50",
        "bg-white dark:bg-slate-900/50 px-3 py-2",
        "transition-all duration-200",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Status dot */}
        <div className="relative flex items-center justify-center flex-shrink-0">
          {isActive && (
            <span
              className={cn(
                "absolute h-2.5 w-2.5 rounded-full opacity-50",
                statusConfig.bg,
                "animate-ping",
              )}
            />
          )}
          <span
            className={cn(
              "relative h-2 w-2 rounded-full",
              statusConfig.bg,
              statusConfig.glow,
            )}
          />
        </div>
        
        {/* Name */}
        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {name}
        </span>
        
        {/* Board */}
        {boardName && (
          <span className="text-xs text-slate-400 dark:text-slate-500 truncate hidden sm:inline">
            on {boardName}
          </span>
        )}
      </div>
      
      {/* Last seen */}
      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
        {formatLastSeen(lastSeenAt)}
      </span>
    </div>
  );
}