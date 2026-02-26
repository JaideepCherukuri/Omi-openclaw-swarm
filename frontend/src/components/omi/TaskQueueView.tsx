"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  Loader2,
  MoreHorizontal,
  Play,
  RotateCcw,
  Sparkles,
  StopCircle,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/atoms/StatusPill";
import { cn } from "@/lib/utils";
import { useOmiQueue } from "@/hooks/useOmiTasks";
import type { TaskRead } from "@/api/generated/model/taskRead";

// Extended task with agent name
interface TaskWithAgent extends TaskRead {
  agent_name?: string;
}

// Queue section component
function QueueSection({
  title,
  tasks,
  icon: Icon,
  color,
  isExpanded,
  onToggle,
  renderActions,
}: {
  title: string;
  tasks: TaskWithAgent[];
  icon: React.ElementType;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
  renderActions?: (task: TaskWithAgent) => React.ReactNode;
}) {
  // Color mappings
  const colorStyles: Record<
    string,
    {
      bg: string;
      border: string;
      iconBg: string;
      iconColor: string;
    }
  > = {
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/20",
      border: "border-amber-200 dark:border-amber-800",
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/20",
      border: "border-blue-200 dark:border-blue-800",
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    indigo: {
      bg: "bg-indigo-50 dark:bg-indigo-950/20",
      border: "border-indigo-200 dark:border-indigo-800",
      iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
      border: "border-emerald-200 dark:border-emerald-800",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
  };

  const styles = colorStyles[color] ?? colorStyles.blue;

  return (
    <Card className={cn("overflow-hidden", styles.bg, styles.border)}>
      <CardHeader
        className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                styles.iconBg
              )}
            >
              <Icon className={cn("h-5 w-5", styles.iconColor)} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={styles.iconColor}>
              {tasks.length}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-4 pt-0">
          {tasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                No tasks in this queue
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <QueueTaskItem
                  key={task.id}
                  task={task}
                  renderActions={renderActions}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Single task item in queue
function QueueTaskItem({
  task,
  renderActions,
}: {
  task: TaskWithAgent;
  renderActions?: (task: TaskWithAgent) => React.ReactNode;
}) {
  const priorityColors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-blue-500",
  };

  return (
    <div className="group relative flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
      {/* Priority dot */}
      <span
        className={cn(
          "h-2 w-2 rounded-full flex-shrink-0",
          priorityColors[task.priority?.toLowerCase() ?? "medium"] ??
            priorityColors.medium
        )}
      />

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/boards/${task.board_id}`}
          className="block text-sm font-medium text-slate-900 dark:text-white truncate hover:text-blue-600 dark:hover:text-blue-400"
        >
          {task.title}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{task.id.slice(0, 8)}</span>
          {task.due_at && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.due_at).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Agent info */}
      {task.assigned_agent_id && (
        <div className="hidden sm:flex items-center gap-2" title={task.agent_name}>
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-medium">
            {(task.agent_name ?? "A").charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[80px]">
            {task.agent_name ?? "Unknown"}
          </span>
        </div>
      )}

      {/* Status */}
      <StatusPill status={task.status ?? "inbox"} />

      {/* Actions */}
      {renderActions && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          {renderActions(task)}
        </div>
      )}
    </div>
  );
}

// Main queue view
export function TaskQueueView({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useOmiQueue();

  const [expandedSections, setExpandedSections] = useState({
    pending: true,
    assigned: true,
    inProgress: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const queueData = data ?? { pending: [], assigned: [], in_progress: [] };

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">
              Failed to load task queue
            </p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const totalTasks =
    queueData.pending.length +
    queueData.assigned.length +
    queueData.in_progress.length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header stats */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Inbox className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {totalTasks}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total Tasks
                  </p>
                </div>
              </div>
              <div className="h-10 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {queueData.pending.length}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1">
                    Pending
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {queueData.assigned.length}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1">
                    Assigned
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {queueData.in_progress.length}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1">
                    In Progress
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue sections */}
      <QueueSection
        title="Pending Tasks"
        tasks={queueData.pending}
        icon={Clock}
        color="amber"
        isExpanded={expandedSections.pending}
        onToggle={() => toggleSection("pending")}
        renderActions={(task) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Assign task"
            >
              <User className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Start task"
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <QueueSection
        title="Assigned Tasks"
        tasks={queueData.assigned}
        icon={User}
        color="blue"
        isExpanded={expandedSections.assigned}
        onToggle={() => toggleSection("assigned")}
        renderActions={(task) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Start task"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Reassign"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <QueueSection
        title="In Progress"
        tasks={queueData.in_progress}
        icon={Loader2}
        color="indigo"
        isExpanded={expandedSections.inProgress}
        onToggle={() => toggleSection("inProgress")}
        renderActions={(task) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="View details"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-red-500"
              title="Stop task"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
      />
    </div>
  );
}
