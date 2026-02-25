"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X, CheckCircle, AlertCircle, AlertTriangle, InfoIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-xl border p-4 shadow-lg transition-all",
  {
    variants: {
      variant: {
        success: "border-emerald-500/20 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
        error: "border-red-500/20 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100",
        warning: "border-amber-500/20 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
        info: "border-blue-500/20 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconVariants = cva("h-5 w-5 flex-shrink-0", {
  variants: {
    variant: {
      success: "text-emerald-600 dark:text-emerald-400",
      error: "text-red-600 dark:text-red-400",
      warning: "text-amber-600 dark:text-amber-400",
      info: "text-blue-600 dark:text-blue-400",
    },
  },
});

export interface ToastProps extends VariantProps<typeof toastVariants> {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  duration?: number;
  position?: ToastPosition;
}

export type ToastPosition = 
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const positionStyles: Record<ToastPosition, string> = {
  "top-left": "top-4 left-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "top-right": "top-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-4 right-4",
};

const getIcon = (variant: ToastProps["variant"]) => {
  const v = variant ?? "info";
  switch (v) {
    case "success":
      return <CheckCircle className={iconVariants({ variant: v })} />;
    case "error":
      return <AlertCircle className={iconVariants({ variant: v })} />;
    case "warning":
      return <AlertTriangle className={iconVariants({ variant: v })} />;
    case "info":
      return <InfoIcon className={iconVariants({ variant: v })} />;
  }
};

// Individual Toast component
export function Toast({
  id,
  title,
  description,
  variant = "info",
  action,
  onDismiss,
  duration = 5000,
}: ToastProps) {
  const [progress, setProgress] = React.useState(100);
  const progressRef = React.useRef<number>(100);
  const animationRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (duration === Infinity) return;
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    const updateProgress = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const newProgress = (remaining / duration) * 100;
      
      progressRef.current = newProgress;
      setProgress(newProgress);
      
      if (remaining > 0) {
        animationRef.current = requestAnimationFrame(updateProgress);
      } else {
        onDismiss?.();
      }
    };
    
    animationRef.current = requestAnimationFrame(updateProgress);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [duration, onDismiss]);

  const handleMouseEnter = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const handleMouseLeave = () => {
    if (duration === Infinity) return;
    // Resume countdown from current progress
    const remainingDuration = (progressRef.current / 100) * duration;
    const endTime = Date.now() + remainingDuration;
    
    const updateProgress = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const newProgress = (remaining / duration) * 100;
      
      progressRef.current = newProgress;
      setProgress(newProgress);
      
      if (remaining > 0) {
        animationRef.current = requestAnimationFrame(updateProgress);
      } else {
        onDismiss?.();
      }
    };
    
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 30,
        opacity: { duration: 0.2 }
      }}
      className={cn(toastVariants({ variant }), "min-w-[320px] max-w-[400px]")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 flex-1">
        <div className="mt-0.5 flex-shrink-0">{getIcon(variant)}</div>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="font-semibold text-sm leading-tight">{title}</h4>
          )}
          {description && (
            <p className="text-sm mt-1 opacity-90 leading-relaxed">{description}</p>
          )}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
      
      <button
        onClick={onDismiss}
        className={cn(
          "flex-shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100",
          "hover:bg-black/5 dark:hover:bg-white/10",
          "focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-2"
        )}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Progress bar */}
      {duration !== Infinity && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-1 bg-current opacity-20"
          style={{ 
            borderRadius: '0 0 0.75rem 0.75rem',
            overflow: 'hidden'
          }}
        >
          <motion.div
            className="h-full bg-current opacity-40"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      )}
    </motion.div>
  );
}

// Toast container - manages multiple toasts
interface ToastContainerProps {
  toasts: ToastProps[];
  position?: ToastPosition;
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, position = "bottom-right", onDismiss }: ToastContainerProps) {
  return (
    <div className={cn("fixed z-[100] flex flex-col gap-2 pointer-events-none", positionStyles[position])}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              {...toast}
              onDismiss={() => onDismiss(toast.id)}
              position={position}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
