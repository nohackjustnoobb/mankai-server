import { useContext } from "react";

import { NotificationContext, type NotificationContextValue } from "./NotificationProvider";

/**
 * Consume the notification system. Returns `{ notifications, notify, dismiss }`
 * where `notify` exposes `.success()`, `.failed()`, and `.warning()` helpers.
 *
 * @example
 * const { notify } = useNotification();
 * notify.success("Saved!");
 * notify.failed("Could not save.", { title: "Error" });
 * notify.warning("This action cannot be undone.");
 */
export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within a <NotificationProvider>");
  }
  return ctx;
}
