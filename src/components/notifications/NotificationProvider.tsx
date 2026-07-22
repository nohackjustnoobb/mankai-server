import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import NotificationOverlay from "./NotificationOverlay";

export type NotificationType = "success" | "failed" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  /** Auto-dismiss timeout in ms. Pass 0 to keep it until dismissed manually. */
  duration: number;
}

export interface NotifyOptions {
  title?: string;
  /** Override the default auto-dismiss timeout (ms). Pass 0 to disable. */
  duration?: number;
}

type NotifyFn = (message: string, options?: NotifyOptions) => string;

export interface NotificationContextValue {
  notifications: Notification[];
  notify: {
    success: NotifyFn;
    failed: NotifyFn;
    warning: NotifyFn;
  };
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

// Errors usually need a bit more reading time than success/warning messages.
const DEFAULT_DURATION: Record<NotificationType, number> = {
  success: 4000,
  warning: 5000,
  failed: 6000,
};

const DEFAULT_TITLE: Record<NotificationType, string> = {
  success: "Success",
  warning: "Warning",
  failed: "Error",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const add = useCallback(
    (type: NotificationType, message: string, options?: NotifyOptions) => {
      counter.current += 1;
      const id = `notification-${counter.current}-${Date.now()}`;
      const notification: Notification = {
        id,
        type,
        message,
        title: options?.title ?? DEFAULT_TITLE[type],
        duration: options?.duration ?? DEFAULT_DURATION[type],
      };
      setNotifications((prev) => [...prev, notification]);
      return id;
    },
    [],
  );

  const notify = useMemo(
    () => ({
      success: (message: string, options?: NotifyOptions) =>
        add("success", message, options),
      failed: (message: string, options?: NotifyOptions) =>
        add("failed", message, options),
      warning: (message: string, options?: NotifyOptions) =>
        add("warning", message, options),
    }),
    [add],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, notify, dismiss }),
    [notifications, notify, dismiss],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationOverlay />
    </NotificationContext.Provider>
  );
}

export { NotificationContext };
