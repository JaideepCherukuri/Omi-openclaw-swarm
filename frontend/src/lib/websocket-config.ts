/**
 * WebSocket Configuration for Mission Control
 * 
 * This file centralizes WebSocket URL configuration to ensure
 * proper connection handling across environments.
 */

// Environment-based WebSocket URL configuration
// In production, this should be set via NEXT_PUBLIC_GATEWAY_WS_URL
// In development/staging, we use relative paths for proxy support
function getWebSocketBaseUrl(): string {
  // If explicitly set in env, use it
  if (process.env.NEXT_PUBLIC_GATEWAY_WS_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_WS_URL;
  }

  // In browser context, use the current host via proxy
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/gateway`;
  }

  // Fallback for SSR
  return 'ws://localhost:18789';
}

export const WEBSOCKET_CONFIG = {
  baseUrl: getWebSocketBaseUrl(),
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
} as const;

// Helper to build WebSocket URL with session key
export function buildWebSocketUrl(sessionKey: string, token?: string): string {
  const baseUrl = WEBSOCKET_CONFIG.baseUrl;
  const params = new URLSearchParams();
  params.set('session', sessionKey);
  if (token) {
    params.set('token', token);
  }
  return `${baseUrl}?${params.toString()}`;
}

// WebSocket connection states
export type WebSocketState = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

// Utility to check if WebSocket is supported
export function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}

// Utility to check if we're in a secure context
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext;
}
