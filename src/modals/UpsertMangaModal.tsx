import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import { MANGA_CREATED_EVENT, MANGA_UPDATED_EVENT } from "#/utils/events.ts";
import Modal, { type ModalAction } from "#/modals/Modal.tsx";
import { type UpsertMangaInput, upsertMangaFn } from "#/utils/manga.functions";
import {
  CREATE_GENRE_OPTIONS,
  CREATE_STATUS_OPTIONS,
  READING_DIRECTION_OPTIONS,
  ReadingDirection,
  Status,
  type CreateGenre,
  type CreateStatus,
} from "#/utils/types";

import styles from "./UpsertMangaModal.module.scss";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type UpsertMangaModalValue = Omit<UpsertMangaInput, "cover" | "id"> & {
  id: string;
  coverImageId: string | null;
};

interface UpsertMangaModalProps {
  manga?: UpsertMangaModalValue;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export default function UpsertMangaModal({
  manga,
  onClose,
  onSaved,
}: UpsertMangaModalProps) {
  const isEdit = manga !== undefined;
  const { notify } = useNotification();
  const upsertManga = useServerFn(upsertMangaFn);

  const [title, setTitle] = useState(manga?.title ?? "");
  const [description, setDescription] = useState(manga?.description ?? "");
  const [authors, setAuthors] = useState(manga?.authors?.join(", ") ?? "");
  const [genres, setGenres] = useState<CreateGenre[]>(manga?.genres ?? []);
  const [status, setStatus] = useState<CreateStatus>(
    manga?.status ?? Status.OnGoing,
  );
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(
    manga?.readingDirection ?? ReadingDirection.RightToLeft,
  );
  const [remarks, setRemarks] = useState(manga?.remarks ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingCoverUrl = manga?.coverImageId
    ? `/api/image/manga/${manga.coverImageId}.webp`
    : null;
  const coverPreview =
    coverObjectUrl ?? (!removeCover ? existingCoverUrl : null);

  useEffect(() => {
    return () => {
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    };
  }, [coverObjectUrl]);

  function toggleGenre(g: CreateGenre) {
    setGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  function handleCoverChange(file: File | null) {
    if (file) {
      setCoverFile(file);
      setCoverObjectUrl(URL.createObjectURL(file));
    } else {
      setCoverFile(null);
      setCoverObjectUrl(null);
    }
  }

  function handleRemoveExistingCover() {
    setRemoveCover(true);
  }

  async function handleSubmit() {
    if (!title.trim()) {
      notify.failed("Title is required.");
      return;
    }

    setSubmitting(true);

    let coverBase64: string | undefined;
    if (coverFile) {
      try {
        coverBase64 = await fileToBase64(coverFile);
      } catch (err) {
        console.error(err);
        notify.failed("Could not read the cover image.");
        setSubmitting(false);
        return;
      }
    }

    const authorsList = authors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: UpsertMangaInput = {
      id: manga?.id,
      title: title.trim(),
      description: description.trim() || undefined,
      authors: authorsList.length > 0 ? authorsList : undefined,
      genres: genres.length > 0 ? genres : undefined,
      status,
      readingDirection,
      remarks: remarks.trim() || undefined,
      cover: coverBase64,
      removeCover: !coverFile && removeCover,
    };

    try {
      const result = await upsertManga({ data: payload });
      if (result.ok) {
        notify.success(isEdit ? "Manga updated." : "Manga created.");
        onSaved?.(result.id);
        window.dispatchEvent(
          new CustomEvent(isEdit ? MANGA_UPDATED_EVENT : MANGA_CREATED_EVENT),
        );
        onClose();
      } else {
        notify.failed(result.error, {
          title: isEdit ? "Could not update manga" : "Could not create manga",
        });
      }
    } catch (err) {
      console.error(err);
      notify.failed(
        isEdit
          ? "Could not update manga. Please try again."
          : "Could not create manga. Please try again.",
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
      label: isEdit ? "Save changes" : "Create manga",
      onClick: handleSubmit,
      loading: submitting,
      loadingLabel: isEdit ? "Saving…" : "Creating…",
      disabled: !title.trim(),
    },
  ];

  return (
    <Modal
      title={isEdit ? "Edit manga" : "Create manga"}
      actions={actions}
      onClose={onClose}
      maxWidth={560}
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
            placeholder="Manga title"
            required
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short synopsis"
            rows={4}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Authors</span>
          <input
            type="text"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Comma-separated, e.g. Akira Toriyama, Naoki Urasawa"
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Genres</span>
          <div className={styles.genres}>
            {CREATE_GENRE_OPTIONS.map((option) => {
              const active = genres.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`${styles.genreChip} ${
                    active ? styles.genreChipActive : ""
                  }`}
                  onClick={() => toggleGenre(option.value)}
                  title={option.label}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            value={String(status)}
            onChange={(e) => setStatus(Number(e.target.value) as CreateStatus)}
            title="Status"
          >
            {CREATE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Reading direction</span>
          <select
            value={String(readingDirection)}
            onChange={(e) =>
              setReadingDirection(Number(e.target.value) as ReadingDirection)
            }
            title="Reading direction"
          >
            {READING_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Remarks</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Internal notes"
            rows={2}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Cover</span>
          <div className={styles.cover}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
              className={styles.coverInput}
            />
            {coverPreview ? (
              <div className={styles.coverPreview}>
                <img src={coverPreview} alt="Cover preview" />
                <button
                  type="button"
                  className={styles.coverRemove}
                  onClick={() =>
                    coverFile
                      ? handleCoverChange(null)
                      : handleRemoveExistingCover()
                  }
                  title="Remove cover"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.coverPicker}
                onClick={() => fileInputRef.current?.click()}
                title="Choose a cover image"
              >
                <ImagePlus size={20} />
                <span>Choose cover</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
