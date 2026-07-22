import { BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { MangaListItem } from "#/utils/manga.functions";
import { GENRE_OPTIONS, STATUS_OPTIONS, type Genre } from "#/utils/types";

import styles from "./MangaCard.module.scss";

function genreLabel(g: Genre): string {
  return GENRE_OPTIONS.find((o) => o.value === g)?.label ?? g;
}

function statusLabel(s: number | null): string | null {
  if (s == null) return null;
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? null;
}

interface MangaCardProps {
  manga: MangaListItem;
}

export default function MangaCard({ manga }: MangaCardProps) {
  const title = manga.title || "Untitled";
  const status = statusLabel(manga.status);
  const coverUrl = manga.coverImageId
    ? `/api/image/manga/${manga.coverImageId}.webp`
    : null;
  const allGenres = manga.genres ?? [];
  const genres = allGenres.slice(0, 3);
  const remaining = allGenres.length - genres.length;

  return (
    <Link
      to="/dashboard/$mangaId"
      params={{ mangaId: manga.id }}
      className={styles.link}
      title={title}
    >
      <article className={styles.card}>
        <div className={styles.cover}>
          {coverUrl ? (
            <img src={coverUrl} alt={title} loading="lazy" />
          ) : (
            <div className={styles.placeholder}>
              <BookOpen size={28} />
            </div>
          )}
          {status && (
            <span className={styles.statusBadge} title={`Status: ${status}`}>
              {status}
            </span>
          )}
        </div>
        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>
          {manga.authors && manga.authors.length > 0 && (
            <p className={styles.authors}>{manga.authors.join(", ")}</p>
          )}
          {genres.length > 0 && (
            <div className={styles.genres}>
              {genres.map((g) => (
                <span key={g} className={styles.genre}>
                  {genreLabel(g)}
                </span>
              ))}
              {remaining > 0 && (
                <span
                  className={styles.genre}
                  title={`${remaining} more genre${remaining > 1 ? "s" : ""}`}
                >
                  +{remaining}
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
