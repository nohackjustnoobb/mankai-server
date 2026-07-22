import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { MANGA_UPDATED_EVENT } from "#/utils/events";

import styles from "./ArrangeSequenceModal.module.scss";

export interface ArrangeSequenceItem {
  id: string;
  label: string;
}

interface ArrangeSequenceModalProps {
  title: string;
  items: ArrangeSequenceItem[];
  onSave: (
    ids: string[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  successMessage: string;
  errorTitle: string;
  onClose: () => void;
}

export default function ArrangeSequenceModal({
  title,
  items,
  onSave,
  successMessage,
  errorTitle,
  onClose,
}: ArrangeSequenceModalProps) {
  const { notify } = useNotification();
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [submitting, setSubmitting] = useState(false);

  const labelById = new Map(items.map((i) => [i.id, i.label]));
  const orderedItems = order.map((id) => ({
    id,
    label: labelById.get(id) ?? id,
  }));
  const dirty = orderedItems.some(
    (item, index) => item.id !== items[index]?.id,
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const result = await onSave(order);
      if (result.ok) {
        notify.success(successMessage);
        window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
        onClose();
      } else {
        notify.failed(result.error, { title: errorTitle });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not save arrangement. Please try again.", {
        title: "Error",
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
      label: "Save order",
      onClick: handleSave,
      loading: submitting,
      loadingLabel: "Saving…",
      disabled: !dirty || submitting,
    },
  ];

  return (
    <Modal
      title={title}
      actions={actions}
      onClose={onClose}
      maxWidth={480}
      disableClose={submitting}
    >
      {orderedItems.length === 0 ? (
        <p className={styles.empty}>Nothing to arrange.</p>
      ) : (
        <ul className={styles.list}>
          {orderedItems.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedItems.length - 1;
            return (
              <li className={styles.row} key={item.id}>
                <span className={styles.index}>{index + 1}</span>
                <span className={styles.label}>{item.label}</span>
                <div className={styles.controls}>
                  <button
                    type="button"
                    className={styles.moveButton}
                    onClick={() => move(index, -1)}
                    disabled={isFirst || submitting}
                    title="Move up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.moveButton}
                    onClick={() => move(index, 1)}
                    disabled={isLast || submitting}
                    title="Move down"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
