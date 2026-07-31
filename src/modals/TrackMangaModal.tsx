import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { TRACKER_REQUEST_CHANGED_EVENT } from "#/utils/events.ts";
import {
  addTrackingMangaFn,
  getTrackerSourcesFn,
  type TrackerSource,
} from "#/utils/tracker.functions.ts";

import styles from "./TrackMangaModal.module.scss";

interface TrackMangaModalProps {
  onClose: () => void;
}

export default function TrackMangaModal({ onClose }: TrackMangaModalProps) {
  const { notify } = useNotification();
  const getTrackerSources = useServerFn(getTrackerSourcesFn);
  const addTrackingManga = useServerFn(addTrackingMangaFn);

  const [sources, setSources] = useState<TrackerSource[]>([]);
  const [trackingId, setTrackingId] = useState("");
  const [trackingMangaId, setTrackingMangaId] = useState("");
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === trackingId),
    [sources, trackingId],
  );

  useEffect(() => {
    let active = true;

    async function loadSources() {
      setLoadingSources(true);
      setSourceError(null);

      try {
        const result = await getTrackerSources();
        if (!active) return;

        setSources(result);
        setTrackingId((current) => current || result[0]?.id || "");
        if (result.length === 0) {
          setSourceError("No tracker sources are currently available.");
        }
      } catch (error) {
        if (!active) return;

        console.error(error);
        setSourceError("Could not load tracker sources.");
        notify.failed("Could not load tracker sources. Please try again.", {
          title: "Tracker unavailable",
        });
      } finally {
        if (active) setLoadingSources(false);
      }
    }

    void loadSources();

    return () => {
      active = false;
    };
  }, [getTrackerSources, notify]);

  async function handleSubmit() {
    if (submitting) return;

    setSubmitting(true);
    try {
      const result = await addTrackingManga({
        data: { trackingId, trackingMangaId },
      });

      if (!result.ok) {
        notify.failed(result.error, { title: "Could not track manga" });
        return;
      }

      if (result.changed) {
        notify.success("Manga added to your tracker.");
      } else {
        notify.warning("You are already tracking this manga.", {
          title: "Already tracked",
        });
      }

      window.dispatchEvent(new CustomEvent(TRACKER_REQUEST_CHANGED_EVENT));
      onClose();
    } catch (error) {
      console.error(error);
      notify.failed("Could not track manga. Please try again.", {
        title: "Could not track manga",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const actions: ModalAction[] = [
    {
      type: "cancel",
      label: "Cancel",
      onClick: onClose,
      disabled: submitting,
    },
    {
      type: "confirm",
      label: "Track manga",
      onClick: () => void handleSubmit(),
      loading: submitting,
      loadingLabel: "Adding…",
      disabled: loadingSources || Boolean(sourceError),
    },
  ];

  return (
    <Modal
      title="Track manga"
      actions={actions}
      onClose={onClose}
      disableClose={submitting}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>Source</span>
          <select
            value={trackingId}
            onChange={(event) => setTrackingId(event.target.value)}
            disabled={loadingSources || Boolean(sourceError)}
          >
            {loadingSources ? (
              <option value="">Loading sources…</option>
            ) : sources.length === 0 ? (
              <option value="">No sources available</option>
            ) : (
              sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedSource?.description && (
          <p className={styles.sourceDescription}>
            {selectedSource.description}
          </p>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Manga ID</span>
          <input
            type="text"
            value={trackingMangaId}
            onChange={(event) => setTrackingMangaId(event.target.value)}
            placeholder="e.g. 12345"
            autoComplete="off"
            spellCheck={false}
            disabled={loadingSources || Boolean(sourceError)}
          />
          <span className={styles.helpText}>
            Enter the manga ID shown by the source.
          </span>
        </label>

        {sourceError && <p className={styles.errorMessage}>{sourceError}</p>}
      </form>
    </Modal>
  );
}
