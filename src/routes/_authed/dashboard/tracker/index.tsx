import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleStop } from "lucide-react";
import { useEffect, useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import ConfirmModal from "#/modals/ConfirmModal.tsx";
import { TRACKER_REQUEST_CHANGED_EVENT } from "#/utils/events.ts";
import {
  fetchTrackingRequestsFn,
  removeTrackingMangaFn,
  type TrackerSummary,
} from "#/utils/tracker.functions.ts";

import styles from "./index.module.scss";

export const Route = createFileRoute("/_authed/dashboard/tracker/")({
  component: TrackerView,
});

const TRACKER_POLL_INTERVAL_MS = 10_000;

type StatusTone = "neutral" | "warning" | "error" | "success";

function getStatus(
  state: TrackerSummary["state"],
): { label: string; tone: StatusTone } {
  switch (state) {
    case "queued":
      return { label: "Queued", tone: "warning" };
    case "importing":
      return { label: "Importing", tone: "warning" };
    case "retrying":
      return { label: "Retrying", tone: "error" };
    case "upToDate":
      return { label: "Up to date", tone: "success" };
    case "paused":
      return { label: "Paused", tone: "neutral" };
  }
}

function getValidDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | string | null): string {
  const date = getValidDate(value);
  if (!date) return "No activity yet";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TrackerView() {
  const { notify } = useNotification();
  const fetchTrackingRequests = useServerFn(fetchTrackingRequestsFn);
  const removeTrackingManga = useServerFn(removeTrackingMangaFn);

  const [items, setItems] = useState<TrackerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [stopTarget, setStopTarget] = useState<TrackerSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let refreshQueued = false;
    let failureReported = false;
    let pollTimer: number | undefined;

    function clearPollTimer() {
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    }

    function schedulePoll() {
      clearPollTimer();
      if (cancelled || document.visibilityState !== "visible") return;
      pollTimer = window.setTimeout(() => {
        void refresh();
      }, TRACKER_POLL_INTERVAL_MS);
    }

    async function refresh(initial = false) {
      if (cancelled) return;
      if (!initial && document.visibilityState !== "visible") {
        refreshQueued = true;
        return;
      }
      if (inFlight) {
        refreshQueued = true;
        return;
      }

      clearPollTimer();
      refreshQueued = false;
      inFlight = true;
      if (initial) {
        setLoading(true);
        setLoadFailed(false);
      }

      try {
        const result = await fetchTrackingRequests();
        if (!cancelled) {
          setItems(result);
          setLoadFailed(false);
          failureReported = false;
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadFailed(true);
          if (!failureReported) {
            failureReported = true;
            notify.failed(
              "Could not load tracked manga. Retrying automatically.",
              {
                title: "Tracker unavailable",
              },
            );
          }
        }
      } finally {
        inFlight = false;
        if (cancelled) return;
        if (initial) setLoading(false);

        if (
          refreshQueued &&
          document.visibilityState === "visible"
        ) {
          refreshQueued = false;
          void refresh();
        } else {
          schedulePoll();
        }
      }
    }

    function refreshNow() {
      clearPollTimer();
      void refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshNow();
      } else {
        clearPollTimer();
      }
    }

    void refresh(true);
    window.addEventListener(
      TRACKER_REQUEST_CHANGED_EVENT,
      refreshNow,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearPollTimer();
      window.removeEventListener(
        TRACKER_REQUEST_CHANGED_EVENT,
        refreshNow,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchTrackingRequests, notify]);

  async function handleStopTracking() {
    if (!stopTarget) return;

    try {
      const result = await removeTrackingManga({
        data: {
          trackingId: stopTarget.trackingId,
          trackingMangaId: stopTarget.trackingMangaId,
        },
      });

      if (!result.ok) {
        notify.failed(result.error, { title: "Could not stop tracking" });
        return;
      }

      setStopTarget(null);
      if (result.changed) {
        notify.success("Tracking stopped.");
      } else {
        notify.warning("This manga was no longer in your tracker.", {
          title: "Already stopped",
        });
      }
      window.dispatchEvent(new CustomEvent(TRACKER_REQUEST_CHANGED_EVENT));
    } catch (error) {
      console.error(error);
      notify.failed("Could not stop tracking. Please try again.", {
        title: "Error",
      });
    }
  }

  return (
    <div className={styles.container}>
      <p className={styles.summary}>
        {items.length === 0
          ? "Manga you track will appear here."
          : `${items.length} tracked manga`}
      </p>

      {loading && items.length === 0 ? (
        <div className={styles.state}>Loading tracked manga…</div>
      ) : loadFailed && items.length === 0 ? (
        <div className={styles.state}>Could not load tracked manga.</div>
      ) : items.length === 0 ? (
        <div className={styles.state}>You are not tracking any manga yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.colSource} />
              <col className={styles.colManga} />
              <col className={styles.colStatus} />
              <col className={styles.colProgress} />
              <col className={styles.colActivity} />
              <col className={styles.colActions} />
            </colgroup>
            <thead>
              <tr>
                <th>Source</th>
                <th>Manga</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Last activity</th>
                <th>Stop</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = getStatus(item.state);
                const activityDate = getValidDate(item.lastActivityAt);
                const mangaLabel =
                  item.localMangaTitle?.trim() || "Waiting for import";

                return (
                  <tr key={`${item.trackingId}:${item.trackingMangaId}`}>
                    <td>
                      <div className={styles.source}>
                        <span className={styles.sourceName}>
                          {item.trackerName}
                        </span>
                        {item.trackerDescription && (
                          <span
                            className={styles.sourceDescription}
                            title={item.trackerDescription}
                          >
                            {item.trackerDescription}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.manga}>
                        {item.localMangaId ? (
                          <Link
                            to="/dashboard/$mangaId"
                            params={{ mangaId: item.localMangaId }}
                            className={styles.mangaLink}
                            title={mangaLabel}
                          >
                            {mangaLabel}
                          </Link>
                        ) : (
                          <span className={styles.pendingTitle}>
                            {mangaLabel}
                          </span>
                        )}
                        <code className={styles.externalId}>
                          ID {item.trackingMangaId}
                        </code>
                      </div>
                    </td>
                    <td>
                      <div className={styles.status}>
                        <span
                          className={`${styles.statusBadge} ${
                            styles[status.tone]
                          }`}
                        >
                          {status.label}
                        </span>
                        {item.failedReason && (
                          <span
                            className={styles.failureReason}
                            title={item.failedReason}
                          >
                            {item.failedReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.progress}>
                        <span>
                          <span className={styles.progressLabel}>Chapters</span>
                          <strong>
                            {item.chapters.completed}/{item.chapters.total}
                          </strong>
                        </span>
                        <span>
                          <span className={styles.progressLabel}>Pages</span>
                          <strong>
                            {item.images.completed}/{item.images.total}
                          </strong>
                        </span>
                      </div>
                    </td>
                    <td className={styles.activityCell}>
                      {activityDate ? (
                        <time
                          className={styles.activity}
                          dateTime={activityDate.toISOString()}
                        >
                          {formatDate(activityDate)}
                        </time>
                      ) : (
                        <span className={styles.activity}>No activity yet</span>
                      )}
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className="dangerIconButton"
                        onClick={() => setStopTarget(item)}
                        title={`Stop tracking ${mangaLabel}`}
                      >
                        <CircleStop size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stopTarget && (
        <ConfirmModal
          title="Stop tracking manga"
          message={
            <>
              Stop tracking{" "}
              <strong>
                {stopTarget.localMangaTitle?.trim() ||
                  `ID ${stopTarget.trackingMangaId}`}
              </strong>
              ? Imported manga and chapters will remain in Mankai. If another
              user is tracking this manga, the shared worker may continue.
            </>
          }
          confirmLabel="Stop tracking"
          loadingLabel="Stopping…"
          variant="danger"
          onConfirm={handleStopTracking}
          onClose={() => setStopTarget(null)}
        />
      )}
    </div>
  );
}
