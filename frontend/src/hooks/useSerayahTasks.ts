"use client";

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/api/mutator";
import type { TaskRead } from "@/api/generated/model/taskRead";
import type { AgentRead } from "@/api/generated/model/agentRead";
import type { ActivityEventRead } from "@/api/generated/model/activityEventRead";

// Types for Serayah API responses
interface SerayahTasksResponse {
  items: TaskRead[];
  total: number;
}

interface SerayahQueueResponse {
  pending: TaskRead[];
  assigned: (TaskRead & { agent_name?: string })[];
  in_progress: (TaskRead & { agent_name?: string })[];
}

interface SerayahActivityResponse {
  items: ActivityEventRead[];
  total: number;
}

interface SerayahAgentStatusResponse {
  items: (AgentRead & { task_count?: number; current_task?: string | null })[];
  total: number;
}

// Fetch functions
const fetchSerayahTasks = async (): Promise<SerayahTasksResponse> => {
  return customFetch<SerayahTasksResponse>("/api/v1/serayah/tasks", {
    method: "GET",
  });
};

const fetchSerayahQueue = async (): Promise<SerayahQueueResponse> => {
  return customFetch<SerayahQueueResponse>("/api/v1/serayah/queue", {
    method: "GET",
  });
};

const fetchSerayahActivity = async (): Promise<SerayahActivityResponse> => {
  return customFetch<SerayahActivityResponse>("/api/v1/serayah/activity", {
    method: "GET",
  });
};

const fetchSerayahAgentStatus = async (): Promise<SerayahAgentStatusResponse> => {
  return customFetch<SerayahAgentStatusResponse>("/api/v1/serayah/agent-status", {
    method: "GET",
  });
};

// React Query hooks
export function useSerayahTasks(enabled = true) {
  return useQuery({
    queryKey: ["serayah", "tasks"],
    queryFn: fetchSerayahTasks,
    enabled,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useSerayahQueue(enabled = true) {
  return useQuery({
    queryKey: ["serayah", "queue"],
    queryFn: fetchSerayahQueue,
    enabled,
    refetchInterval: 15000, // Refresh every 15 seconds for queue
  });
}

export function useSerayahActivity(enabled = true) {
  return useQuery({
    queryKey: ["serayah", "activity"],
    queryFn: fetchSerayahActivity,
    enabled,
    refetchInterval: 20000, // Refresh every 20 seconds
  });
}

export function useSerayahAgentStatus(enabled = true) {
  return useQuery({
    queryKey: ["serayah", "agent-status"],
    queryFn: fetchSerayahAgentStatus,
    enabled,
    refetchInterval: 10000, // Refresh every 10 seconds for agent status
  });
}

// Combined hook for dashboard
export function useSerayahDashboard() {
  const tasks = useSerayahTasks();
  const queue = useSerayahQueue();
  const activity = useSerayahActivity();
  const agents = useSerayahAgentStatus();

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
