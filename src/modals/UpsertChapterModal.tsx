import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { MANGA_UPDATED_EVENT } from "#/utils/events";
import {
  type UpsertChapterInput,
  upsertChapterFn,
} from "#/utils/manga.functions";

import styles from "./UpsertChapterModal.module.scss";

export type UpsertChapterModalValue = {
  id: string;
  title: string | null;
  locked: boolean;
};

interface UpsertChapterModalProps {
  chapterGroupId: string;
  groupTitle: string | null;
  chapter?: UpsertChapterModalValue;
  onClose: () => void;
}

export default function UpsertChapterModal({
  chapterGroupId,
  groupTitle,
  chapter,
  onClose,
}: UpsertChapterModalProps) {
  const isEdit = chapter !== undefined;
  const { notify } = useNotification();
  const upsertChapter = useServerFn(upsertChapterFn);
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [locked, setLocked] = useState(chapter?.locked ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload: UpsertChapterInput = {
        id: chapter?.id,
        chapterGroupId,
        title: title.trim() || undefined,
        locked,
      };
      const result = await upsertChapter({ data: payload });
      if (result.ok) {
        notify.success(isEdit ? "Chapter updated." : "Chapter created.");
        window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
        onClose();
      } else {
        notify.failed(result.error, {
          title: isEdit
            ? "Could not update chapter"
            : "Could not create chapter",
        });
      }
    } catch (err) {
      console.error(err);
      notify.failed(
        isEdit
          ? "Could not update chapter. Please try again."
          : "Could not create chapter. Please try again.",
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
      label: isEdit ? "Save changes" : "Create chapter",
      onClick: handleSubmit,
      loading: submitting,
      loadingLabel: isEdit ? "Saving…" : "Creating…",
      disabled: !title.trim(),
    },
  ];

  const heading = groupTitle?.trim() || "Untitled group";

  return (
    <Modal
      title={
        isEdit ? `Edit chapter in ${heading}` : `New chapter in ${heading}`
      }
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
            placeholder="e.g. Chapter 1"
            autoFocus
          />
        </label>

        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
          />
          <span className={styles.checkboxLabel}>Locked</span>
        </label>
      </form>
    </Modal>
  );
}
