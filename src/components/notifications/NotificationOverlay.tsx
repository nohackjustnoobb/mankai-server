import {
  AlertTriangle,
  CheckCircle,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";

import type { Notification, NotificationType } from "./NotificationProvider";
import { useNotification } from "./useNotification";
import styles from "./NotificationOverlay.module.scss";

const ICON_BY_TYPE: Record<NotificationType, LucideIcon> = {
  success: CheckCircle,
  failed: XCircle,
  warning: AlertTriangle,
};

export default function NotificationOverlay() {
  const { notifications, dismiss } = useNotification();

  return (
    <div className={styles.overlay}>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const Icon = ICON_BY_TYPE[notification.type];

  useEffect(() => {
    if (notification.duration <= 0) return;
    const timer = setTimeout(
      () => onDismiss(notification.id),
      notification.duration,
    );
    return () => clearTimeout(timer);
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <div className={`${styles.notification} ${styles[notification.type]}`}>
      <Icon size={18} className={styles.icon} />
      <div className={styles.body}>
        {notification.title && (
          <span className={styles.title}>{notification.title}</span>
        )}
        <p className={styles.message}>{notification.message}</p>
      </div>
      <button
        type="button"
        className={styles.close}
        onClick={() => onDismiss(notification.id)}
        title="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
