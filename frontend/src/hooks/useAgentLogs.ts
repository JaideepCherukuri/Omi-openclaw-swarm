"use client";

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/api/mutator";

// Enriched agent log types
export interface AgentLog {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  event_type: "heartbeat" | "task_start" | "task_complete" | "task_error" | "think" | "tool_call" | "tool_result" | "status_change" | "system";
  level: "info" | "success" | "warning" | "error";
  message: string;
  details?: string;
  task_id?: string;
  task_title?: string;
  duration_ms?: number;
  tokens_input?: number;
  tokens_output?: number;
  metadata?: Record<string, any>;
}

interface AgentLogsResponse {
  logs: AgentLog[];
  count: number;
}

// Fetch enriched agent logs
const fetchAgentLogs = async (
  agentId?: string,
  eventType?: string,
  level?: string,
  hours: number = 24,
  limit: number = 100
): Promise<AgentLogsResponse> => {
  const params = new URLSearchParams();
  if (agentId) params.append("agent_id", agentId);
  if (eventType) params.append("event_type", eventType);
  if (level) params.append("level", level);
  params.append("hours", hours.toString());
  params.append("limit", limit.toString());

  const response = await customFetch<AgentLogsResponse>(
    `/api/v1/omi/agent-logs?${params.toString()}`,
    { method: "GET" }
  );

  if (!response) {
    throw new Error("Failed to fetch agent logs");
  }

  return response;
};

// React Query hook for enriched agent logs
export function useAgentLogs(
  agentId?: string,
  eventType?: string,
  level?: string,
  options?: { refetchInterval?: number }
) {
  return useQuery({
    queryKey: ["agent-logs", agentId, eventType, level],
    queryFn: () => fetchAgentLogs(agentId, eventType, level),
    refetchInterval: options?.refetchInterval ?? 10000, // Refresh every 10 seconds
  });
}
