"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  User,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/atoms/StatusPill";
import { cn } from "@/lib/utils";
import { useOmiDashboard } from "@/hooks/useOmiTasks";
import type { TaskRead } from "@/api/generated/model/taskRead";
import type { ActivityEventRead } from "@/api/generated/model/activityEventRead";

// Status badge component
function TaskStatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} />;
}

// Priority indicator
function PriorityIndicator({ priority }: { priority?: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-blue-500",
  };
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        colors[priority?.toLowerCase() ?? "medium"] ?? colors.medium
      )}
      title={`Priority: ${priority ?? "medium"}`}
    />
  );
}

// Agent avatar component
function AgentAvatar({
  name,
  status,
  size = "md",
}: {
  name: string;
  status?: string;
  size?: "sm" | "md";
}) {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
  };

  const statusColors: Record<string, string> = {
    online: "bg-emerald-500",
    busy: "bg-amber-500",
    offline: "bg-slate-400",
    error: "bg-red-500",
    unknown: "bg-slate-400",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative inline-flex items-center justify-center">
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-medium",
          "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
          sizeClasses[size]
        )}
      >
        {initials || <Bot className="h-3 w-3" />}
      </div>
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900",
            statusColors[status] ?? statusColors.unknown
          )}
        />
      )}
    </div>
  );
}

// Task row component
function TaskRow({
  task,
  agentName,
  onMessage,
}: {
  task: TaskRead;
  agentName?: string;
  onMessage?: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border surface-card p-3 hover:border-accent transition-colors">
      <PriorityIndicator priority={task.priority ?? undefined} />

      <div className="flex-1 min-w-0">
        <Link
          href={`/boards/${task.board_id}`}
          className="block text-sm font-medium text-strong truncate hover:text-accent"
        >
          {task.title}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          <span>ID: {task.id.slice(0, 8)}</span>
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

      <div className="flex items-center gap-3">
        <TaskStatusBadge status={task.status ?? "inbox"} />

        {task.assigned_agent_id && agentName && (
          <div className="flex items-center gap-2">
            <AgentAvatar name={agentName} size="sm" />
            <span className="hidden sm:inline text-xs text-muted">
              {agentName}
            </span>
          </div>
        )}

        {onMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMessage}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
            title="Message agent"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

import { AgentActivityFeed } from "./AgentActivityFeed";

// Activity feed item (legacy - replaced by AgentActivityFeed)
function ActivityItem({ event }: { event: ActivityEventRead }) {
  const icons: Record<string, React.ReactNode> = {
    task_created: <Plus className="h-4 w-4 text-success" />,
    task_assigned: <User className="h-4 w-4 text-accent" />,
    task_completed: <CheckCircle2 className="h-4 w-4 text-success" />,
    task_updated: <Sparkles className="h-4 w-4 text-warning" />,
    comment_added: <MessageSquare className="h-4 w-4 text-accent-strong" />,
  };

  const timeAgo = (dateStr: string) => {
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
  };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-full surface-muted flex-shrink-0">
        {icons[event.event_type] ?? <Sparkles className="h-4 w-4 text-muted" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text">
          {event.message ?? `${event.event_type} event`}
        </p>
        <span className="text-xs text-muted">{timeAgo(event.created_at)}</span>
      </div>
    </div>
  );
}

// Quick action button
function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  variant = "primary",
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button
      variant={variant === "primary" ? "primary" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2",
        variant === "primary" && "bg-blue-600 hover:bg-blue-700"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

// Main dashboard component
export function OmiDashboard({ className }: { className?: string }) {
  const { tasks, queue, activity, agents, isLoading, isError, refetch } =
    useOmiDashboard();
  const [showCreateTask, setShowCreateTask] = useState(false);

  const tasksData = tasks.data?.items ?? [];
  const queueData = queue.data;
  const activityData = activity.data?.items ?? [];
  const agentsData = agents.data?.items ?? [];

  // Calculate stats
  const stats = {
    total: tasksData.length,
    pending: queueData?.pending.length ?? 0,
    inProgress: queueData?.in_progress.length ?? 0,
    assigned: queueData?.assigned.length ?? 0,
    activeAgents: agentsData.filter(
      (a) => a.status === "online" || a.status === "busy"
    ).length,
  };

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-muted">
              Failed to load Omi dashboard
            </p>
            <Button variant="outline" onClick={refetch} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  My Tasks
                </p>
                <p className="text-2xl font-bold text-strong mt-1">
                  {isLoading ? "..." : stats.total}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent-soft flex items-center justify-center">
                <Inbox className="h-5 w-5 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Pending
                </p>
                <p className="text-2xl font-bold text-strong mt-1">
                  {isLoading ? "..." : stats.pending}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  In Progress
                </p>
                <p className="text-2xl font-bold text-strong mt-1">
                  {isLoading ? "..." : stats.inProgress}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-accent-strong" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">
                  Active Agents
                </p>
                <p className="text-2xl font-bold text-strong mt-1">
                  {isLoading ? "..." : stats.activeAgents}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-strong">
              Quick Actions
            </h3>
            <Button variant="ghost" size="sm" onClick={refetch}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <QuickActionButton
              icon={Plus}
              label="Create Task"
              onClick={() => setShowCreateTask(true)}
              variant="primary"
            />
            <QuickActionButton
              icon={MessageSquare}
              label="Message Agent"
              onClick={() => {}}
              variant="secondary"
            />
            <QuickActionButton
              icon={Bot}
              label="View Agents"
              onClick={() => (window.location.href = "/agents")}
              variant="secondary"
            />
            <QuickActionButton
              icon={CheckCircle2}
              label="View Approvals"
              onClick={() => (window.location.href = "/approvals")}
              variant="secondary"
            />
          </div>
        </CardContent>
      </Card>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-strong">
                  Tasks I Created
                </h3>
                <p className="text-sm text-muted mt-1">
                  Tasks auto-created by Omi
                </p>
              </div>
              <Badge variant="outline">{tasksData.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-lg surface-muted animate-pulse"
                  />
                ))}
              </div>
            ) : tasksData.length === 0 ? (
              <div className="text-center py-8">
                <Inbox className="h-12 w-12 text-muted mx-auto mb-3" />
                <p className="text-muted">
                  No tasks created yet
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowCreateTask(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first task
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {tasksData.slice(0, 5).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    agentName={
                      agentsData.find((a) => a.id === task.assigned_agent_id)?.name
                    }
                    onMessage={() => {}}
                  />
                ))}
                {tasksData.length > 5 && (
                  <p className="text-center text-sm text-muted py-2">
                    +{tasksData.length - 5} more tasks
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-strong">
              Recent Activity
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg surface-muted animate-pulse"
                  />
                ))}
              </div>
            ) : activityData.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-muted mx-auto mb-3" />
                <p className="text-muted">
                  No recent activity
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activityData.slice(0, 6).map((event) => (
                  <ActivityItem key={event.id} event={event} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Activity Feed - Enhanced */}
        <AgentActivityFeed />

        {/* Agent status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-strong">
                Agent Status
              </h3>
              <Badge variant="outline">{agentsData.length} agents</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg surface-muted animate-pulse"
                  />
                ))}
              </div>
            ) : agentsData.length === 0 ? (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-muted mx-auto mb-3" />
                <p className="text-muted">
                  No agents configured
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => (window.location.href = "/agents/new")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create agent
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {agentsData.slice(0, 5).map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border surface-card"
                  >
                    <AgentAvatar
                      name={agent.name}
                      status={agent.status ?? "unknown"}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-strong truncate">
                        {agent.name}
                      </p>
                      <p className="text-xs text-muted">
                        {agent.status}
                      </p>
                    </div>
                    <TaskStatusBadge status={agent.status ?? "unknown"} />
                  </div>
                ))}
                {agentsData.length > 5 && (
                  <p className="text-center text-sm text-muted py-2">
                    +{agentsData.length - 5} more agents
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
