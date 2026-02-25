"use client";

import * as React from "react";
import { ToastContainer, type ToastPosition, type ToastProps } from "./toast";

// Toast context type
type ToastContextType = {
  toast: (props: Omit<ToastProps, "id">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  update: (id: string, props: Partial<Omit<ToastProps, "id">>) => void;
};

// Toast context
const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

// Hook to use toast
export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Toast provider props
interface ToastProviderProps {
  children: React.ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

// Generate unique ID
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ToastProvider({ 
  children, 
  position = "bottom-right",
  maxToasts = 5 
}: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  // Add a new toast
  const toast = React.useCallback((props: Omit<ToastProps, "id">) => {
    const id = generateId();
    
    setToasts((prev) => {
      const newToasts = [{ ...props, id, position }, ...prev];
      // Limit to maxToasts
      if (newToasts.length > maxToasts) {
        return newToasts.slice(0, maxToasts);
      }
      return newToasts;
    });
    
    return id;
  }, [position, maxToasts]);

  // Dismiss a specific toast
  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dismiss all toasts
  const dismissAll = React.useCallback(() => {
    setToasts([]);
  }, []);

  // Update a toast
  const update = React.useCallback((id: string, props: Partial<Omit<ToastProps, "id">>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...props } : t))
    );
  }, []);

  // Convenience methods
 React.useEffect(() => {
    // Expose convenience methods on the toast function
    (toast as unknown as Record<string, unknown>).success = (title: string, description?: string) =>
      toast({ title, description, variant: "success" });
    (toast as unknown as Record<string, unknown>).error = (title: string, description?: string) =>
      toast({ title, description, variant: "error" });
    (toast as unknown as Record<string, unknown>).warning = (title: string, description?: string) =>
      toast({ title, description, variant: "warning" });
    (toast as unknown as Record<string, unknown>).info = (title: string, description?: string) =>
      toast({ title, description, variant: "info" });
  }, [toast]);

  const value = React.useMemo(
    () => ({ toast, dismiss, dismissAll, update }),
    [toast, dismiss, dismissAll, update]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} position={position} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// Convenience hooks for specific toast types
export function useToastHelpers() {
  const { toast } = useToast();

  return React.useMemo(() => ({
    success: (title: string, description?: string, duration?: number) =>
      toast({ title, description, variant: "success", duration }),
    error: (title: string, description?: string, duration?: number) =>
      toast({ title, description, variant: "error", duration }),
    warning: (title: string, description?: string, duration?: number) =>
      toast({ title, description, variant: "warning", duration }),
    info: (title: string, description?: string, duration?: number) =>
      toast({ title, description, variant: "info", duration }),
    loading: (title: string, description?: string) =>
      toast({ title, description, variant: "info", duration: Infinity }),
  }), [toast]);
}
