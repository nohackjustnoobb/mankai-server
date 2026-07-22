import { type ReactNode, useState } from "react";

import Modal, { type ModalAction } from "#/modals/Modal.tsx";

import styles from "./ConfirmModal.module.scss";

export type ConfirmModalVariant = "confirm" | "danger";

export interface ConfirmModalProps {
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loadingLabel?: string;
  variant?: ConfirmModalVariant;
  maxWidth?: number | string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  loadingLabel = "Working…",
  variant = "confirm",
  maxWidth = 440,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  const actions: ModalAction[] = [
    {
      type: "cancel",
      label: cancelLabel,
      onClick: onClose,
      disabled: loading,
    },
    {
      type: variant,
      label: confirmLabel,
      onClick: handleConfirm,
      loading,
      loadingLabel,
    },
  ];

  return (
    <Modal
      title={title}
      actions={actions}
      onClose={onClose}
      maxWidth={maxWidth}
      disableClose={loading}
    >
      <p className={styles.message}>{message}</p>
    </Modal>
  );
}
