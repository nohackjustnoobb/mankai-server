import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import MangaCard from "#/components/MangaCard";
import { useNotification } from "#/components/notifications/useNotification";
import {
  MANGA_CREATED_EVENT,
  MANGA_DELETED_EVENT,
  MANGA_UPDATED_EVENT,
} from "#/utils/events.ts";
import { fetchMangasFn, type MangaListItem } from "#/utils/manga.functions";
import { Genre, GENRE_OPTIONS, Status, STATUS_OPTIONS } from "#/utils/types";

import styles from "./index.module.scss";

type MangaSearch = {
  status?: Status;
  genre?: Genre;
  page?: number;
  search?: string;
};

const MANGA_STATUS_VALUES = new Set(STATUS_OPTIONS.map((o) => o.value));
const MANGA_GENRE_VALUES = new Set(GENRE_OPTIONS.map((o) => o.value));

export const Route = createFileRoute("/_authed/dashboard/")({
  validateSearch: (search: Record<string, unknown>) => {
    const parsed: MangaSearch = {};

    if (search.status) {
      const rawStatus = Number(search.status);
      parsed.status = MANGA_STATUS_VALUES.has(rawStatus as Status)
        ? (rawStatus as Status)
        : Status.Any;
    }

    if (search.genre) {
      parsed.genre = MANGA_GENRE_VALUES.has(search.genre as Genre)
        ? (search.genre as Genre)
        : Genre.All;
    }

    if (search.search) {
      const value = String(search.search).trim();
      if (value) parsed.search = value;
    }

    if (search.page) {
      const rawPage = Number(search.page);
      parsed.page =
        Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    }

    return parsed;
  },
  component: MangaView,
});

function MangaView() {
  const { notify } = useNotification();
  const fetchManga = useServerFn(fetchMangasFn);
  const navigate = useNavigate();

  const {
    status = Status.Any,
    genre = Genre.All,
    page = 1,
    search,
  } = Route.useSearch();

  const [items, setItems] = useState<MangaListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchManga({ data: { status, search, genre, page } })
      .then((result) => {
        if (cancelled) return;

        setItems(result.items);
        setTotalPages(result.totalPages);

        if (result.page < page) {
          navigate({
            to: "/dashboard",
            search: { status, search, genre, page: result.page },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          notify.failed("Could not load manga.", { title: "Error" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, search, genre, page, refreshKey, fetchManga, navigate, notify]);

  useEffect(() => {
    function handleMangaChanged() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener(MANGA_CREATED_EVENT, handleMangaChanged);
    window.addEventListener(MANGA_UPDATED_EVENT, handleMangaChanged);
    window.addEventListener(MANGA_DELETED_EVENT, handleMangaChanged);
    return () => {
      window.removeEventListener(MANGA_CREATED_EVENT, handleMangaChanged);
      window.removeEventListener(MANGA_UPDATED_EVENT, handleMangaChanged);
      window.removeEventListener(MANGA_DELETED_EVENT, handleMangaChanged);
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.field}>
            <span className={styles.label}>Status</span>
            <select
              className={styles.filter}
              value={String(status)}
              onChange={(e) => {
                const next = Number(e.target.value) as Status;
                navigate({
                  to: "/dashboard",
                  search: { status: next, search, genre, page: 1 },
                });
              }}
              title="Status"
              disabled={loading}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Genre</span>
            <select
              className={styles.filter}
              value={genre}
              onChange={(e) => {
                const next = e.target.value as Genre;
                navigate({
                  to: "/dashboard",
                  search: { status, search, genre: next, page: 1 },
                });
              }}
              title="Genre"
              disabled={loading}
            >
              {GENRE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() =>
              navigate({
                to: "/dashboard",
                search: { status, search, genre, page: Math.max(1, page - 1) },
              })
            }
            disabled={page <= 1 || loading}
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className={styles.pageIndicator}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.navButton}
            onClick={() =>
              navigate({
                to: "/dashboard",
                search: {
                  status,
                  search,
                  genre,
                  page: Math.min(totalPages, page + 1),
                },
              })
            }
            disabled={page >= totalPages || loading}
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className={styles.state}>Loading manga…</div>
      ) : items.length === 0 ? (
        <div className={styles.state}>No manga found.</div>
      ) : (
        <div className={styles.grid}>
          {items.map((m) => (
            <MangaCard key={m.id} manga={m} />
          ))}
        </div>
      )}
    </div>
  );
}
