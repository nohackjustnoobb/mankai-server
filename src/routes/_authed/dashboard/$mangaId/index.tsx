import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpDown,
  BookOpen,
  FilePlus,
  FolderPlus,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useNotification } from "#/components/notifications/useNotification";
import { useDashboardNav } from "#/context/DashboardNav";
import ArrangeSequenceModal from "#/modals/ArrangeSequenceModal.tsx";
import ConfirmModal from "#/modals/ConfirmModal.tsx";
import UpsertChapterGroupModal, {
  type UpsertChapterGroupModalValue,
} from "#/modals/UpsertChapterGroupModal.tsx";
import UpsertChapterModal from "#/modals/UpsertChapterModal.tsx";
import UpsertMangaModal, {
  type UpsertMangaModalValue,
} from "#/modals/UpsertMangaModal.tsx";
import { MANGA_DELETED_EVENT, MANGA_UPDATED_EVENT } from "#/utils/events";
import {
  type MangaChapterGroup,
  arrangeChapterGroupsFn,
  arrangeChaptersFn,
  deleteChapterGroupFn,
  deleteMangaFn,
  getMangaFn,
} from "#/utils/manga.functions";
import {
  GENRE_OPTIONS,
  READING_DIRECTION_OPTIONS,
  STATUS_OPTIONS,
  type CreateGenre,
  type CreateStatus,
  type Genre,
} from "#/utils/types";

import styles from "./index.module.scss";

export const Route = createFileRoute("/_authed/dashboard/$mangaId/")({
  loader: async ({ params }) => {
    const manga = await getMangaFn({ data: { id: params.mangaId } });
    if (!manga) throw notFound();
    return manga;
  },
  component: MangaDetailsView,
});

function genreLabel(g: Genre): string {
  return GENRE_OPTIONS.find((o) => o.value === g)?.label ?? g;
}

function statusLabel(s: number | null): string | null {
  if (s == null) return null;
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? null;
}

function readingDirectionLabel(d: number | null): string | null {
  if (d == null) return null;
  return READING_DIRECTION_OPTIONS.find((o) => o.value === d)?.label ?? null;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MangaDetailsView() {
  const router = useRouter();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const deleteManga = useServerFn(deleteMangaFn);
  const deleteChapterGroup = useServerFn(deleteChapterGroupFn);
  const arrangeChapterGroups = useServerFn(arrangeChapterGroupsFn);
  const arrangeChapters = useServerFn(arrangeChaptersFn);
  const { setItems } = useDashboardNav();
  const manga = Route.useLoaderData();
  const { user } = Route.useRouteContext();

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showArrangeGroups, setShowArrangeGroups] = useState(false);
  const [createChapterGroupId, setCreateChapterGroupId] = useState<
    string | null
  >(null);
  const [arrangeChaptersGroupId, setArrangeChaptersGroupId] = useState<
    string | null
  >(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [editChapterGroup, setEditChapterGroup] =
    useState<UpsertChapterGroupModalValue | null>(null);

  useEffect(() => {
    setItems([
      {
        label: manga.title?.trim() || `Manga #${manga.id}`,
        to: "/dashboard/$mangaId",
        params: { mangaId: manga.id },
      },
    ]);

    return () => setItems([]);
  }, [manga, setItems]);

  useEffect(() => {
    function handleMangaUpdated() {
      void router.invalidate();
    }
    window.addEventListener(MANGA_UPDATED_EVENT, handleMangaUpdated);
    return () => {
      window.removeEventListener(MANGA_UPDATED_EVENT, handleMangaUpdated);
    };
  }, [router]);

  const title = manga.title?.trim() || "Untitled";
  const status = statusLabel(manga.status);
  const readingDirection = readingDirectionLabel(manga.readingDirection);
  const coverUrl = manga.coverImageId
    ? `/api/image/manga/${manga.coverImageId}.webp`
    : null;
  const authors = manga.authors ?? [];
  const genres = manga.genres ?? [];
  const description = manga.description?.trim() || null;
  const remarks = manga.remarks?.trim() || null;
  const chapterGroups: MangaChapterGroup[] = manga.chapterGroups ?? [];
  const deleteGroup = deleteGroupId
    ? (chapterGroups.find((g) => g.id === deleteGroupId) ?? null)
    : null;
  const createChapterGroup = createChapterGroupId
    ? (chapterGroups.find((g) => g.id === createChapterGroupId) ?? null)
    : null;
  const arrangeChaptersGroup = arrangeChaptersGroupId
    ? (chapterGroups.find((g) => g.id === arrangeChaptersGroupId) ?? null)
    : null;

  const editValue: UpsertMangaModalValue = {
    id: manga.id,
    title: manga.title ?? "",
    description: manga.description ?? undefined,
    authors: manga.authors ?? undefined,
    genres: genres as CreateGenre[],
    status: (manga.status ?? undefined) as CreateStatus | undefined,
    readingDirection: manga.readingDirection ?? undefined,
    remarks: manga.remarks ?? undefined,
    coverImageId: manga.coverImageId,
  };

  async function handleDelete() {
    try {
      const result = await deleteManga({ data: { id: manga.id } });
      if (result.ok) {
        notify.success("Manga deleted.");
        window.dispatchEvent(new CustomEvent(MANGA_DELETED_EVENT));
        setShowDelete(false);
        navigate({ to: "/dashboard" });
      } else {
        notify.failed(result.error, { title: "Could not delete manga" });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not delete manga. Please try again.", {
        title: "Error",
      });
    }
  }

  async function handleDeleteGroup() {
    if (!deleteGroupId) return;
    try {
      const result = await deleteChapterGroup({ data: { id: deleteGroupId } });
      if (result.ok) {
        notify.success("Chapter group deleted.");
        setDeleteGroupId(null);
        void router.invalidate();
      } else {
        notify.failed(result.error, { title: "Could not delete group" });
      }
    } catch (err) {
      console.error(err);
      notify.failed("Could not delete group. Please try again.", {
        title: "Error",
      });
    }
  }

  const genreText = genres.map((g) => genreLabel(g)).join(", ");
  const canManage = user.role === "admin" || manga.creator?.id === user.id;

  return (
    <div className={styles.manga}>
      <div className={styles.cover}>
        {coverUrl ? (
          <img src={coverUrl} alt={title} />
        ) : (
          <div className={styles.placeholder}>
            <BookOpen size={36} />
          </div>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.topRow}>
          <h1 className={styles.title}>{title}</h1>

          {canManage && (
            <div className={styles.actions}>
              <button
                type="button"
                className="iconButton"
                onClick={() => setShowEdit(true)}
                title="Edit manga"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="dangerIconButton"
                onClick={() => setShowDelete(true)}
                title="Delete manga"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        <div className={styles.attributes}>
          {status && (
            <div className={styles.attribute}>
              <span className={styles.attrLabel}>Status</span>
              <span className={styles.attrValue}>{status}</span>
            </div>
          )}
          {readingDirection && (
            <div className={styles.attribute}>
              <span className={styles.attrLabel}>Reading direction</span>
              <span className={styles.attrValue}>{readingDirection}</span>
            </div>
          )}
          {authors.length > 0 && (
            <div className={styles.attribute}>
              <span className={styles.attrLabel}>Authors</span>
              <span className={styles.attrValue}>{authors.join(", ")}</span>
            </div>
          )}
          {genres.length > 0 && (
            <div className={styles.attribute}>
              <span className={styles.attrLabel}>Genres</span>
              <span className={styles.attrValue}>{genreText}</span>
            </div>
          )}
          {manga.creator && (
            <div className={styles.attribute}>
              <span className={styles.attrLabel}>Created by</span>
              <span className={styles.attrValue}>{manga.creator.email}</span>
            </div>
          )}
          <div className={styles.attribute}>
            <span className={styles.attrLabel}>Created</span>
            <span className={styles.attrValue}>
              {formatDate(manga.createdAt)}
            </span>
          </div>
          <div className={styles.attribute}>
            <span className={styles.attrLabel}>Updated</span>
            <span className={styles.attrValue}>
              {formatDate(manga.updatedAt)}
            </span>
          </div>
        </div>

        <div className={styles.block}>
          <span className={styles.blockLabel}>Description</span>
          {description ? (
            <p className={styles.blockValue}>{description}</p>
          ) : (
            <p className={`${styles.blockValue} ${styles.empty}`}>
              No description.
            </p>
          )}
        </div>

        {remarks && (
          <div className={styles.block}>
            <span className={styles.blockLabel}>Remarks</span>
            <p className={styles.blockValue}>{remarks}</p>
          </div>
        )}
      </div>

      <div className={styles.chapters}>
        <div className={styles.chaptersHeader}>
          <h2 className={styles.chaptersTitle}>Chapters</h2>
          {canManage && (
            <div className={styles.chaptersActions}>
              {chapterGroups.length >= 2 && (
                <button
                  type="button"
                  className="outlineButton"
                  onClick={() => setShowArrangeGroups(true)}
                >
                  <ArrowUpDown size={16} />
                  <span>Arrange</span>
                </button>
              )}
              <button
                type="button"
                className={styles.newGroupButton}
                onClick={() => setShowCreateGroup(true)}
              >
                <FolderPlus size={16} />
                <span>New group</span>
              </button>
            </div>
          )}
        </div>

        {chapterGroups.length === 0 ? (
          <p className={styles.chaptersEmpty}>No chapters yet.</p>
        ) : (
          <div className={styles.groups}>
            {chapterGroups.map((group) => {
              const groupTitle = group.title?.trim() || "Untitled group";
              const groupChapters = group.chapters ?? [];
              return (
                <div className={styles.group} key={group.id}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupTitle}>{groupTitle}</span>
                    {canManage && (
                      <div className={styles.groupActions}>
                        {groupChapters.length >= 2 && (
                          <button
                            type="button"
                            className="iconButton"
                            onClick={() => setArrangeChaptersGroupId(group.id)}
                            title="Arrange chapters"
                          >
                            <ArrowUpDown size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="iconButton"
                          onClick={() => setCreateChapterGroupId(group.id)}
                          title="New chapter"
                        >
                          <FilePlus size={16} />
                        </button>
                        <button
                          type="button"
                          className="iconButton"
                          onClick={() =>
                            setEditChapterGroup({
                              id: group.id,
                              title: group.title,
                            })
                          }
                          title="Edit group"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="dangerIconButton"
                          onClick={() => setDeleteGroupId(group.id)}
                          title="Delete group"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {groupChapters.length === 0 ? (
                    <p className={styles.groupEmpty}>
                      No chapters in this group.
                    </p>
                  ) : (
                    <ul className={styles.chapterList}>
                      {groupChapters.map((ch) => {
                        const chapterTitle =
                          ch.title?.trim() || "Untitled chapter";
                        return (
                          <li key={ch.id}>
                            <Link
                              to="/dashboard/$mangaId/$chapterId"
                              params={{ mangaId: manga.id, chapterId: ch.id }}
                              className={styles.chapter}
                              title={chapterTitle}
                            >
                              <span className={styles.chapterTitle}>
                                {chapterTitle}
                              </span>
                              <div className={styles.chapterFooter}>
                                {ch.locked && (
                                  <Lock size={14} className={styles.lockIcon} />
                                )}
                                <span className={styles.chapterMeta}>
                                  {formatDate(ch.updatedAt)}
                                </span>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEdit && (
        <UpsertMangaModal
          manga={editValue}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="Delete manga"
          message={
            <>
              Are you sure you want to delete <strong>{title}</strong>? This
              action cannot be undone.
            </>
          }
          confirmLabel="Delete manga"
          loadingLabel="Deleting…"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}

      {showCreateGroup && (
        <UpsertChapterGroupModal
          mangaId={manga.id}
          onClose={() => setShowCreateGroup(false)}
        />
      )}

      {editChapterGroup && (
        <UpsertChapterGroupModal
          mangaId={manga.id}
          group={editChapterGroup}
          onClose={() => setEditChapterGroup(null)}
        />
      )}

      {showArrangeGroups && (
        <ArrangeSequenceModal
          title="Arrange chapter groups"
          items={chapterGroups.map((g) => ({
            id: g.id,
            label: g.title?.trim() || "Untitled group",
          }))}
          onSave={(ids) =>
            arrangeChapterGroups({ data: { mangaId: manga.id, ids } })
          }
          successMessage="Chapter group order saved."
          errorTitle="Could not save order"
          onClose={() => setShowArrangeGroups(false)}
        />
      )}

      {arrangeChaptersGroup && (
        <ArrangeSequenceModal
          title={`Arrange chapters in ${
            arrangeChaptersGroup.title?.trim() || "Untitled group"
          }`}
          items={(arrangeChaptersGroup.chapters ?? []).map((c) => ({
            id: c.id,
            label: c.title?.trim() || "Untitled chapter",
          }))}
          onSave={(ids) =>
            arrangeChapters({
              data: { chapterGroupId: arrangeChaptersGroup.id, ids },
            })
          }
          successMessage="Chapter order saved."
          errorTitle="Could not save order"
          onClose={() => setArrangeChaptersGroupId(null)}
        />
      )}

      {createChapterGroup && (
        <UpsertChapterModal
          chapterGroupId={createChapterGroup.id}
          groupTitle={createChapterGroup.title}
          onClose={() => setCreateChapterGroupId(null)}
        />
      )}

      {deleteGroup && (
        <ConfirmModal
          title="Delete chapter group"
          message={
            <>
              Are you sure you want to delete{" "}
              <strong>{deleteGroup.title?.trim() || "this group"}</strong>? All
              chapters inside will be removed. This action cannot be undone.
            </>
          }
          confirmLabel="Delete group"
          loadingLabel="Deleting…"
          variant="danger"
          onConfirm={handleDeleteGroup}
          onClose={() => setDeleteGroupId(null)}
        />
      )}
    </div>
  );
}
