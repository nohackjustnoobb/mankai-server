import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { MANGA_UPDATED_EVENT } from "#/utils/events";
import {
  type UpsertChapterGroupInput,
  upsertChapterGroupFn,
} from "#/utils/manga.functions";

import styles from "./UpsertChapterGroupModal.module.scss";

export type UpsertChapterGroupModalValue = {
  id: string;
  title: string | null;
};

interface UpsertChapterGroupModalProps {
  mangaId: string;
  group?: UpsertChapterGroupModalValue;
  onClose: () => void;
}

export default function UpsertChapterGroupModal({
  mangaId,
  group,
  onClose,
}: UpsertChapterGroupModalProps) {
  const isEdit = group !== undefined;
  const { notify } = useNotification();
  const upsertChapterGroup = useServerFn(upsertChapterGroupFn);
  const [title, setTitle] = useState(group?.title ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload: UpsertChapterGroupInput = {
        id: group?.id,
        mangaId,
        title: title.trim() || undefined,
      };
      const result = await upsertChapterGroup({ data: payload });
      if (result.ok) {
        notify.success(
          isEdit ? "Chapter group updated." : "Chapter group created.",
        );
        window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
        onClose();
      } else {
        notify.failed(result.error, {
          title: isEdit ? "Could not update group" : "Could not create group",
        });
      }
    } catch (err) {
      console.error(err);
      notify.failed(
        isEdit
          ? "Could not update group. Please try again."
          : "Could not create group. Please try again.",
        { title: "Error" },
      );
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
      label: isEdit ? "Save changes" : "Create group",
      onClick: handleSubmit,
      loading: submitting,
      loadingLabel: isEdit ? "Saving…" : "Creating…",
      disabled: !title.trim(),
    },
  ];

  return (
    <Modal
      title={isEdit ? "Edit chapter group" : "New chapter group"}
      actions={actions}
      onClose={onClose}
      maxWidth={440}
      disableClose={submitting}
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Volume, Serial"
            autoFocus
          />
        </label>
      </form>
    </Modal>
  );
}
