import {
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown, ImagePlus, Lock, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import { useDashboardNav, type NavItem } from "#/context/DashboardNav";
import ArrangeSequenceModal from "#/modals/ArrangeSequenceModal.tsx";
import ConfirmModal from "#/modals/ConfirmModal.tsx";
import UpsertChapterModal from "#/modals/UpsertChapterModal.tsx";
import { MANGA_UPDATED_EVENT } from "#/utils/events";
import {
  arrangeChapterImagesFn,
  createChapterImageFn,
  deleteChapterFn,
  deleteChapterImageFn,
  getChapterFn,
  getMangaFn,
} from "#/utils/manga.functions";

import styles from "./$chapterId.module.scss";

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

export const Route = createFileRoute("/_authed/dashboard/$mangaId/$chapterId")({
  loader: async ({ params }) => {
    const [chapter, manga] = await Promise.all([
      getChapterFn({ data: { id: params.chapterId } }),
      getMangaFn({ data: { id: params.mangaId } }),
    ]);
    if (!chapter || !manga) throw notFound();
    return { chapter, manga };
  },
  component: ChapterView,
});

function ChapterView() {
  const router = useRouter();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const deleteChapter = useServerFn(deleteChapterFn);
  const createChapterImage = useServerFn(createChapterImageFn);
  const deleteChapterImage = useServerFn(deleteChapterImageFn);
  const arrangeChapterImages = useServerFn(arrangeChapterImagesFn);
  const { setItems } = useDashboardNav();
  const { chapter, manga } = Route.useLoaderData();
  const { user } = Route.useRouteContext();

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showArrangeImages, setShowArrangeImages] = useState(false);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chapterTitle = chapter.title?.trim() || "Untitled chapter";

  const items = useMemo<NavItem[]>(() => {
    const mangaTitle = manga.title?.trim() || `Manga #${manga.id}`;
    const group = (manga.chapterGroups ?? []).find((g) =>
      (g.chapters ?? []).some((c) => c.id === chapter.id),
    );
    const groupTitle = group?.title?.trim() || "Untitled group";

    return [
      {
        label: mangaTitle,
        to: "/dashboard/$mangaId",
        params: { mangaId: manga.id },
      },
      {
        label: groupTitle,
      },
      {
        label: chapterTitle,
        to: "/dashboard/$mangaId/$chapterId",
        params: { mangaId: manga.id, chapterId: chapter.id },
      },
    ];
  }, [manga, chapter, chapterTitle]);

  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [items, setItems]);

  useEffect(() => {
    function handleMangaUpdated() {
      void router.invalidate();
    }
    window.addEventListener(MANGA_UPDATED_EVENT, handleMangaUpdated);
    return () => {
      window.removeEventListener(MANGA_UPDATED_EVENT, handleMangaUpdated);
    };
  }, [router]);

  const canManage = user.role === "admin" || manga.creator?.id === user.id;
  const group = (manga.chapterGroups ?? []).find(
    (g) => g.id === chapter.chapterGroupId,
  );
  const groupTitle = group?.title ?? null;
  const images = chapter.images ?? [];
  const deleteImage = deleteImageId
    ? (images.find((img) => img.id === deleteImageId) ?? null)
    : null;

  async function handleDelete() {
    try {
      const result = await deleteChapter({ data: { id: chapter.id } });
      if (result.ok) {
        notify.success("Chapter deleted.");
        setShowDelete(false);
        void router.invalidate();
        navigate({ to: "/dashboard/$mangaId", params: { mangaId: manga.id } });
      } else {
        notify.failed(result.error, { title: "Could not delete chapter" });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not delete chapter. Please try again.", {
        title: "Error",
      });
    }
  }

  async function handleAddImages(files: File[]) {
    if (files.length === 0) return;

    setUploading(true);
    let success = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      try {
        const base64 = await fileToBase64(files[i]);
        const result = await createChapterImage({
          data: { chapterId: chapter.id, image: base64 },
        });
        if (result.ok) {
          success++;
        } else {
          failed++;
          lastError = result.error;
        }
      } catch (err) {
        console.error(err);
        failed++;
      }
    }
    setUploading(false);
    setUploadProgress(null);

    if (success > 0 && failed === 0) {
      notify.success(`Added ${success} ${success === 1 ? "image" : "images"}.`);
      window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
    } else if (success > 0 && failed > 0) {
      notify.warning(`Added ${success}, ${failed} failed.`);
      window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
    } else {
      notify.failed(
        lastError
          ? `No images were added: ${lastError}`
          : "No images were added.",
        { title: "Upload failed" },
      );
    }
  }

  async function handleDeleteImage() {
    if (!deleteImageId) return;
    try {
      const result = await deleteChapterImage({ data: { id: deleteImageId } });
      if (result.ok) {
        notify.success("Image deleted.");
        setDeleteImageId(null);
        window.dispatchEvent(new CustomEvent(MANGA_UPDATED_EVENT));
      } else {
        notify.failed(result.error, { title: "Could not delete image" });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not delete image. Please try again.", {
        title: "Error",
      });
    }
  }

  return (
    <div className={styles.chapter}>
      <div className={styles.topRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{chapterTitle}</h1>
          {chapter.locked && <Lock size={20} className={styles.lockIcon} />}
        </div>

        {canManage && (
          <div className={styles.actions}>
            {images.length >= 2 && (
              <button
                type="button"
                className="iconButton"
                onClick={() => setShowArrangeImages(true)}
                disabled={uploading}
                title="Arrange pages"
              >
                <ArrowUpDown size={16} />
              </button>
            )}
            <button
              type="button"
              className="iconButton"
              onClick={() => setShowEdit(true)}
              title="Edit chapter"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="dangerIconButton"
              onClick={() => setShowDelete(true)}
              title="Delete chapter"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <section className={styles.pages}>
        {uploadProgress && (
          <p className={styles.progress}>
            Uploading {uploadProgress.current} of {uploadProgress.total}…
          </p>
        )}

        {images.length === 0 && !canManage ? (
          <p className={styles.pagesEmpty}>No pages yet.</p>
        ) : (
          <div className={styles.grid}>
            {images.map((img, index) => (
              <div className={styles.page} key={img.id}>
                <img
                  src={`/api/image/chapter/${img.id}.webp`}
                  alt={`Page ${index + 1}`}
                />
                <span className={styles.pageNumber}>{index + 1}</span>
                {canManage && (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => setDeleteImageId(img.id)}
                    disabled={uploading}
                    title="Delete page"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <button
                type="button"
                className={styles.addTile}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Add images"
              >
                <ImagePlus size={24} />
                <span>Add images</span>
              </button>
            )}
          </div>
        )}

        {canManage && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void handleAddImages(files);
            }}
            className={styles.fileInput}
          />
        )}
      </section>

      {showEdit && (
        <UpsertChapterModal
          chapterGroupId={chapter.chapterGroupId}
          groupTitle={groupTitle}
          chapter={{
            id: chapter.id,
            title: chapter.title,
            locked: chapter.locked,
          }}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="Delete chapter"
          message={
            <>
              Are you sure you want to delete <strong>{chapterTitle}</strong>?
              All images in this chapter will be removed. This action cannot be
              undone.
            </>
          }
          confirmLabel="Delete chapter"
          loadingLabel="Deleting…"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}

      {showArrangeImages && (
        <ArrangeSequenceModal
          title="Arrange pages"
          items={images.map((img, index) => ({
            id: img.id,
            label: `Page ${index + 1}`,
          }))}
          onSave={(ids) =>
            arrangeChapterImages({ data: { chapterId: chapter.id, ids } })
          }
          successMessage="Page order saved."
          errorTitle="Could not save order"
          onClose={() => setShowArrangeImages(false)}
        />
      )}

      {deleteImage && (
        <ConfirmModal
          title="Delete page"
          message={
            <>
              Are you sure you want to delete this page? This action cannot be
              undone.
            </>
          }
          confirmLabel="Delete page"
          loadingLabel="Deleting…"
          variant="danger"
          onConfirm={handleDeleteImage}
          onClose={() => setDeleteImageId(null)}
        />
      )}
    </div>
  );
}
