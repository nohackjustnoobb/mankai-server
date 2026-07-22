import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { USER_CREATED_EVENT, USER_UPDATED_EVENT } from "#/utils/events.ts";
import { type UpsertUserInput, upsertUserFn } from "#/utils/user.functions";

import styles from "./UpsertUserModal.module.scss";

export type UpsertUserModalValue = {
  id: string;
  email: string;
  isActive: boolean;
};

interface UpsertUserModalProps {
  user?: UpsertUserModalValue;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export default function UpsertUserModal({
  user,
  onClose,
  onSaved,
}: UpsertUserModalProps) {
  const isEdit = user !== undefined;
  const { notify } = useNotification();
  const upsertUser = useServerFn(upsertUserFn);

  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      notify.failed("Email is required.");
      return;
    }

    if (!isEdit && password.length < 8) {
      notify.failed("Password must be at least 8 characters.");
      return;
    }
    if (password && password.length < 8) {
      notify.failed("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      notify.failed("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const payload: UpsertUserInput = {
      id: user?.id,
      email: email.trim(),
      password: password || undefined,
      isActive,
    };

    try {
      const result = await upsertUser({ data: payload });
      if (result.ok) {
        notify.success(result.created ? "User created." : "User updated.");
        onSaved?.(result.id);
        window.dispatchEvent(
          new CustomEvent(
            result.created ? USER_CREATED_EVENT : USER_UPDATED_EVENT,
          ),
        );
        onClose();
      } else {
        notify.failed(result.error, {
          title: isEdit ? "Could not update user" : "Could not create user",
        });
      }
    } catch (err) {
      console.error(err);
      notify.failed(
        isEdit
          ? "Could not update user. Please try again."
          : "Could not create user. Please try again.",
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
      label: isEdit ? "Save changes" : "Create user",
      onClick: handleSubmit,
      loading: submitting,
      loadingLabel: isEdit ? "Saving…" : "Creating…",
      disabled: !email.trim() || (!isEdit && (!password || !confirmPassword)),
    },
  ];

  return (
    <Modal
      title={isEdit ? "Edit user" : "Create user"}
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
          <span className={styles.label}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            {isEdit ? "New password (optional)" : "Password"}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              isEdit
                ? "Leave blank to keep current password"
                : "At least 8 characters"
            }
            minLength={8}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
        </label>

        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className={styles.checkboxLabel}>Active</span>
        </label>
      </form>
    </Modal>
  );
}
