"use client";

import { cn } from "@/lib/utils";
import {
  Inbox,
  PlayCircle,
  Eye,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

type BoardStats = {
  inbox: number;
  inProgress: number;
  review: number;
  done: number;
  total: number;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
};

type BoardOverviewProps = {
  name: string;
  stats: BoardStats;
  onClick?: () => void;
  className?: string;
};

const STATUS_COLUMNS = [
  { key: "inbox", label: "Inbox", icon: Inbox, color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
  { key: "inProgress", label: "In Progress", icon: PlayCircle, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
  { key: "review", label: "Review", icon: Eye, color: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900/30" },
  { key: "done", label: "Done", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
] as const;

export function BoardOverview({
  name,
  stats,
  onClick,
  className,
}: BoardOverviewProps) {
  const completionRate = stats.total > 0 
    ? Math.round((stats.done / stats.total) * 100) 
    : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/50",
        "bg-white dark:bg-slate-900/50",
        "transition-all duration-200",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-black/20",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {name}
          </h3>
          
          {/* Trend indicator */}
          {stats.trend && (
            <div
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                stats.trend === "up" && "text-emerald-500",
                stats.trend === "down" && "text-red-500",
                stats.trend === "neutral" && "text-slate-400",
              )}
            >
              {stats.trend === "up" && <TrendingUp className="h-3.5 w-3.5" />}
              {stats.trend === "down" && <TrendingDown className="h-3.5 w-3.5" />}
              {stats.trend === "neutral" && <Minus className="h-3.5 w-3.5" />}
              {stats.trendValue && <span>{stats.trendValue}</span>}
            </div>
          )}
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {completionRate}%
          </span>
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-4 gap-px bg-slate-100 dark:bg-slate-800">
        {STATUS_COLUMNS.map((column) => {
          const value = stats[column.key as keyof BoardStats] as number;
          const Icon = column.icon;
          
          return (
            <div
              key={column.key}
              className={cn(
                "flex flex-col items-center py-3 px-2",
                "bg-white dark:bg-slate-900",
                "group-hover:bg-slate-50 dark:group-hover:bg-slate-900/50",
                "transition-colors duration-200",
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md mb-1",
                  column.bg,
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", column.color)} />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                {value}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {column.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Mini board card for sidebars/lists */
type BoardCardMiniProps = {
  name: string;
  taskCount: number;
  activeCount?: number;
  onClick?: () => void;
  className?: string;
};

export function BoardCardMini({
  name,
  taskCount,
  activeCount,
  onClick,
  className,
}: BoardCardMiniProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg",
        "border border-slate-200 dark:border-slate-700/50",
        "bg-white dark:bg-slate-900/50 px-3 py-2",
        "transition-all duration-200",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {name}
        </span>
      </div>
      
      <div className="flex items-center gap-2 flex-shrink-0">
        {activeCount !== undefined && activeCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {activeCount}
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
          {taskCount} tasks
        </span>
      </div>
    </div>
  );
}

/* Stat card for dashboard KPIs */
type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  progress?: number;
  className?: string;
};

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  progress,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/50",
        "bg-white dark:bg-slate-900/50 p-5",
        "transition-all duration-200",
        "hover:border-slate-300 dark:hover:border-slate-600",
        "hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-black/20",
        className,
      )}
    >
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-blue-500/3 dark:to-blue-500/5" />
      
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2 text-blue-500 dark:text-blue-400">
            {icon}
          </div>
        </div>
        
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {value}
          </span>
          
          {trend && trendValue && (
            <span
              className={cn(
                "text-xs font-medium mb-1",
                trend === "up" && "text-emerald-500 dark:text-emerald-400",
                trend === "down" && "text-red-500 dark:text-red-400",
                trend === "neutral" && "text-slate-400 dark:text-slate-500",
              )}
            >
              {trend === "up" && "+"}
              {trendValue}
            </span>
          )}
        </div>
        
        {progress !== undefined && (
          <div className="mt-3 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress >= 75 ? "bg-emerald-500" :
                progress >= 50 ? "bg-blue-500" :
                progress >= 25 ? "bg-amber-500" : "bg-slate-400",
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}