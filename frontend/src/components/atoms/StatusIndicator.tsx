"use client";

import { cn } from "@/lib/utils";

type StatusType = "online" | "offline" | "busy" | "warning" | "error" | "unknown";

type StatusIndicatorProps = {
  status: StatusType;
  label?: string;
  showPulse?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const STATUS_CONFIG: Record<
  StatusType,
  { bg: string; glow: string; ring?: string }
> = {
  online: {
    bg: "bg-emerald-500",
    glow: "shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    ring: "ring-emerald-500/30",
  },
  offline: {
    bg: "bg-slate-400 dark:bg-slate-500",
    glow: "",
  },
  busy: {
    bg: "bg-amber-500",
    glow: "shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    ring: "ring-amber-500/30",
  },
  warning: {
    bg: "bg-orange-500",
    glow: "shadow-[0_0_8px_rgba(249,115,22,0.6)]",
    ring: "ring-orange-500/30",
  },
  error: {
    bg: "bg-red-500",
    glow: "shadow-[0_0_8px_rgba(239,68,68,0.6)]",
    ring: "ring-red-500/30",
  },
  unknown: {
    bg: "bg-slate-400",
    glow: "",
  },
};

const SIZE_CONFIG: Record<string, { dot: string; ring?: string }> = {
  sm: { dot: "h-2 w-2" },
  md: { dot: "h-2.5 w-2.5" },
  lg: { dot: "h-3 w-3", ring: "ring-4" },
};

export function StatusIndicator({
  status,
  label,
  showPulse = true,
  size = "md",
  className,
}: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex items-center justify-center">
        {/* Pulse animation ring for active states */}
        {showPulse && (status === "online" || status === "busy") && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              config.bg,
              "animate-ping",
            )}
          />
        )}
        {/* Main dot */}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            sizeConfig.dot,
            config.bg,
            config.glow,
            config.ring && sizeConfig.ring && `ring ${config.ring}`,
          )}
        />
      </span>
      {label && (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </span>
      )}
    </div>
  );
}

/* Agent status mapping helpers */
export const agentStatusToIndicator = (
  status: string | null | undefined,
): StatusType => {
  const normalized = (status ?? "").trim().toLowerCase();
  switch (normalized) {
    case "online":
    case "active":
    case "running":
      return "online";
    case "busy":
    case "working":
    case "processing":
      return "busy";
    case "offline":
    case "inactive":
    case "stopped":
      return "offline";
    case "error":
    case "failed":
    case "degraded":
      return "error";
    case "warning":
    case "updating":
    case "provisioning":
      return "warning";
    default:
      return "unknown";
  }
};

/* Task status mapping helpers */
export const taskStatusToIndicator = (
  status: string | null | undefined,
): StatusType => {
  const normalized = (status ?? "").trim().toLowerCase();
  switch (normalized) {
    case "done":
    case "completed":
    case "success":
      return "online";
    case "in_progress":
    case "in-progress":
    case "running":
    case "active":
      return "busy";
    case "review":
    case "pending":
    case "waiting":
      return "warning";
    case "error":
    case "failed":
    case "rejected":
      return "error";
    case "inbox":
    case "todo":
    case "new":
      return "offline";
    default:
      return "unknown";
  }
};

/* Status badge component for inline display */
type StatusBadgeProps = {
  status: StatusType;
  label: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const labelColors: Record<StatusType, string> = {
    online: "text-emerald-700 dark:text-emerald-400",
    offline: "text-slate-500 dark:text-slate-400",
    busy: "text-amber-700 dark:text-amber-400",
    warning: "text-orange-700 dark:text-orange-400",
    error: "text-red-700 dark:text-red-400",
    unknown: "text-slate-500 dark:text-slate-400",
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.bg,
          config.glow,
        )}
      />
      <span className={cn("text-sm font-medium", labelColors[status])}>
        {label}
      </span>
    </div>
  );
}