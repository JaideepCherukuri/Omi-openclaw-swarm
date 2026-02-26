"use client";

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/api/mutator";
import type { TaskRead } from "@/api/generated/model/taskRead";
import type { AgentRead } from "@/api/generated/model/agentRead";
import type { ActivityEventRead } from "@/api/generated/model/activityEventRead";

// Types for Omi API responses
interface OmiTasksResponse {
  items: TaskRead[];
  total: number;
}

interface OmiQueueResponse {
  pending: TaskRead[];
  assigned: (TaskRead & { agent_name?: string })[];
  in_progress: (TaskRead & { agent_name?: string })[];
}

interface OmiActivityResponse {
  items: ActivityEventRead[];
  total: number;
}

interface OmiAgentStatusResponse {
  items: (AgentRead & { task_count?: number; current_task?: string | null })[];
  total: number;
}

// Fetch functions
const fetchOmiTasks = async (): Promise<OmiTasksResponse> => {
  return customFetch<OmiTasksResponse>("/api/v1/omi/tasks", {
    method: "GET",
  });
};

const fetchOmiQueue = async (): Promise<OmiQueueResponse> => {
  return customFetch<OmiQueueResponse>("/api/v1/omi/queue", {
    method: "GET",
  });
};

const fetchOmiActivity = async (): Promise<OmiActivityResponse> => {
  return customFetch<OmiActivityResponse>("/api/v1/omi/activity", {
    method: "GET",
  });
};

const fetchOmiAgentStatus = async (): Promise<OmiAgentStatusResponse> => {
  return customFetch<OmiAgentStatusResponse>("/api/v1/omi/agent-status", {
    method: "GET",
  });
};

// React Query hooks
export function useOmiTasks(enabled = true) {
  return useQuery({
    queryKey: ["omi", "tasks"],
    queryFn: fetchOmiTasks,
    enabled,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useOmiQueue(enabled = true) {
  return useQuery({
    queryKey: ["omi", "queue"],
    queryFn: fetchOmiQueue,
    enabled,
    refetchInterval: 15000, // Refresh every 15 seconds for queue
  });
}

export function useOmiActivity(enabled = true) {
  return useQuery({
    queryKey: ["omi", "activity"],
    queryFn: fetchOmiActivity,
    enabled,
    refetchInterval: 20000, // Refresh every 20 seconds
  });
}

export function useOmiAgentStatus(enabled = true) {
  return useQuery({
    queryKey: ["omi", "agent-status"],
    queryFn: fetchOmiAgentStatus,
    enabled,
    refetchInterval: 10000, // Refresh every 10 seconds for agent status
  });
}

// Combined hook for dashboard
export function useOmiDashboard() {
  const tasks = useOmiTasks();
  const queue = useOmiQueue();
  const activity = useOmiActivity();
  const agents = useOmiAgentStatus();

  return {
    tasks,
    queue,
    activity,
    agents,
    isLoading: tasks.isLoading || queue.isLoading || activity.isLoading || agents.isLoading,
    isError: tasks.isError || queue.isError || activity.isError || agents.isError,
    refetch: () => {
      tasks.refetch();
      queue.refetch();
      activity.refetch();
      agents.refetch();
    },
  };
}
