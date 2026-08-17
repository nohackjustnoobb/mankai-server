import { createHash } from "node:crypto";
import { Converter } from "opencc-js";

import { trackerLogger } from "#/lib/logger.server.ts";
import Tracker, {
  type TrackerChapter,
  type TrackerManga,
} from "#/trackers/tracker.ts";
import { Genre, ReadingDirection, Status } from "#/utils/types.ts";

const BASE_URL = "https://hkmangaapi.manhuaren.com";
const HASH_KEY = "4e0a48e1c0b54041bce9c8f0e036124d";

const BASE_PARAMS = {
  gak: "android_manhuaren2",
  gaui: "462099841",
  gft: "json",
  gui: "462099841",
};

const BASE_HEADERS = {
  Authorization:
    "YINGQISTS2 eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc19mcm9tX3JndCI6ZmFsc2UsInVzZXJfbGVnYWN5X2lkIjo0NjIwOTk4NDEsImRldmljZV9pZCI6Ii0zNCw2OSw2MSw4MSw2LDExNCw2MSwtMzUsLTEsNDgsNiwzNSwtMTA3LC0xMjIsLTExLC04NywxMjcsNjQsLTM4LC03LDUwLDEzLC05NCwtMTcsLTI3LDkyLC0xNSwtMTIwLC0zNyw3NCwtNzksNzgiLCJ1dWlkIjoiOTlmYTYzYjQtNjFmNy00ODUyLThiNDMtMjJlNGY3YzY2MzhkIiwiY3JlYXRldGltZV91dGMiOiIyMDIzLTA3LTAzIDAyOjA1OjMwIiwibmJmIjoxNjg4MzkzMTMwLCJleHAiOjE2ODgzOTY3MzAsImlhdCI6MTY4ODM5MzEzMH0.IJAkDs7l3rEvURHiy06Y2STyuiIu-CYUk5E8en4LU0_mrJ83hKZR1nVqKiAY9ry_6ZmFzVfg-ap_TXTF6GTqihyM-nmEpD2NVWeWZ5VHWVgJif4ezB4YTs0YEpnVzYCk_x4p0wU2GYbqf1BFrNO7PQPMMPDGfaCTUqI_Pe2B0ikXMaN6CDkMho26KVT3DK-xytc6lO92RHvg65Hp3xC1qaonQXdws13wM6WckUmrswItroy9z38hK3w0rQgXOK2mu3o_4zOKLGfq5JpqOCNQCLJgQ0_jFXhMtaz6E_fMZx54fZHfF1YrA-tfs7KFgiYxMb8PnNILoniFrQhvET3y-Q",
  "X-Yq-Yqci":
    '{"av":"1.3.8","cy":"HK","lut":"1662458886867","nettype":1,"os":2,"di":"733A83F2FD3B554C3C4E4D46A307D560A52861C7","fcl":"appstore","fult":"1662458886867","cl":"appstore","pi":"","token":"","fut":"1662458886867","le":"en-HK","ps":"1","ov":"16.4","at":2,"rn":"1668x2388","ln":"","pt":"com.CaricatureManGroup.CaricatureManGroup","dm":"iPad8,6"}',
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 12; sdk_gphone64_arm64 Build/SE1A.220630.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 MobileSafari/537.36",
};

const GENRES: Record<string, Genre> = {
  热血: Genre.Action,
  恋爱: Genre.Romance,
  爱情: Genre.Romance,
  校园: Genre.SchoolLife,
  百合: Genre.Yuri,
  彩虹: Genre.BoysLove,
  冒险: Genre.Adventure,
  后宫: Genre.Harem,
  科幻: Genre.SpeculativeFiction,
  战争: Genre.War,
  悬疑: Genre.Suspense,
  推理: Genre.SpeculativeFiction,
  搞笑: Genre.Comedy,
  奇幻: Genre.Magic,
  魔法: Genre.Magic,
  恐怖: Genre.Horror,
  神鬼: Genre.Horror,
  历史: Genre.Historical,
  同人: Genre.FanFiction,
  运动: Genre.Sports,
  机甲: Genre.Mecha,
  限制级: Genre.Mature,
  绅士: Genre.Mature,
  伪娘: Genre.Otokonoko,
};

type MhrChapter = {
  sectionId: string | number;
  sectionName: string;
};

type MhrManga = {
  mangaId: string | number;
  mangaName: string;
  mangaIsOver: boolean | number;
  mangaNewsectionId?: string | number;
  mangaNewestContent?: string;
  mangaNewsectionName?: string;
};

type MhrDetailedManga = MhrManga & {
  mangaPicimageUrl?: string;
  mangaCoverimageUrl: string;
  mangaIntro: string;
  mangaNewestTime: string;
  mangaAuthors: string[];
  mangaTheme: string | string[];
  mangaRolls: MhrChapter[];
  mangaEpisode: MhrChapter[];
  mangaWords: MhrChapter[];
};

type MhrRead = {
  hostList: string[];
  query: string;
  mangaSectionImages: string[];
};

const s2t = Converter({ from: "cn", to: "hk" });

const revision = (manga: MhrManga) =>
  JSON.stringify([
    s2t(manga.mangaName),
    Boolean(manga.mangaIsOver),
    manga.mangaNewsectionId?.toString() ?? null,
    manga.mangaNewestContent || manga.mangaNewsectionName
      ? s2t(manga.mangaNewestContent ?? manga.mangaNewsectionName!)
      : null,
  ]);

export default class MhrTracker extends Tracker {
  readonly id = "mhr";
  readonly name = "漫畫人";
  readonly description = "Tracks manga from 漫畫人 using the MHR API.";
  readonly invalidMangaIdMessage =
    "MHR Manga ID must be a canonical positive decimal number";
  updateInterval = 5 * 60_000;
  getUpdatesTimeout = 1_000;
  getMangaTimeout = 1_000;
  getChapterTimeout = 1_000;
  getImageTimeout = 250;

  normalizeMangaId(id: string): string {
    return id.trim();
  }

  validateMangaId(id: string): boolean {
    return /^[1-9]\d*$/.test(id);
  }

  async getUpdates(mangas: TrackerManga[]) {
    if (mangas.length === 0) return [];

    const data = await this.request<{ mangas: MhrManga[] }>(
      "/v2/manga/getBatchDetail",
      {},
      {
        mangaCoverimageType: 1,
        bookIds: [],
        somanIds: [],
        mangaIds: mangas.map((manga) => Number(manga.id)),
      },
    );
    const localMeta = new Map(mangas.map((manga) => [manga.id, manga.meta]));

    return data.mangas.flatMap((manga) => {
      const id = manga.mangaId.toString();
      return localMeta.has(id)
        ? [{ id, needsUpdate: localMeta.get(id) !== revision(manga) }]
        : [];
    });
  }

  async getManga(id: string): Promise<TrackerManga> {
    const data = await this.request<MhrDetailedManga>("/v1/manga/getDetail", {
      mangaId: id,
      mangaDetailVersion: "",
    });
    const toChapters = (chapters: MhrChapter[]): TrackerChapter[] =>
      chapters
        .map((chapter) => ({
          id: chapter.sectionId.toString(),
          title: s2t(chapter.sectionName),
        }))
        .reverse();

    const chapters: TrackerManga["chapters"] = [];
    const series = toChapters(data.mangaWords);
    if (series.length > 0) {
      chapters.push({ title: "series", chapters: series });
    }

    const extras = toChapters(data.mangaEpisode);
    if (extras.length > 0) {
      chapters.push({ title: "extra", chapters: extras });
    }

    const volumes = toChapters(data.mangaRolls);
    if (volumes.length > 0) {
      chapters.push({ title: "volume", chapters: volumes });
    }

    const theme = Array.isArray(data.mangaTheme)
      ? data.mangaTheme.join(",")
      : data.mangaTheme;
    return {
      id: data.mangaId.toString(),
      title: s2t(data.mangaName),
      cover: data.mangaPicimageUrl ?? data.mangaCoverimageUrl,
      status: data.mangaIsOver ? Status.Completed : Status.OnGoing,
      readingDirection: ReadingDirection.RightToLeft,
      description: s2t(data.mangaIntro),
      updatedAt: Date.parse(`${data.mangaNewestTime.replace(" ", "T")}+08:00`),
      authors: data.mangaAuthors.map((author) => author.trim()).filter(Boolean),
      genres: [
        ...new Set(
          Object.entries(GENRES)
            .filter(([name]) => theme.includes(name))
            .map(([, genre]) => genre),
        ),
      ],
      chapters,
      meta: revision(data),
    };
  }

  async getChapter(
    manga: TrackerManga,
    chapter: TrackerChapter,
  ): Promise<string[]> {
    const data = await this.request<MhrRead>("/v1/manga/getRead", {
      mangaSectionId: chapter.id,
      mangaId: manga.id,
      netType: "1",
      loadreal: "1",
      imageQuality: "2",
    });
    const host = data.hostList[0]!;

    return data.mangaSectionImages.map((path) => {
      const url = path.startsWith("http") ? path : `${host}${path}`;
      return `${url}${data.query}`;
    });
  }

  async getImage(url: string): Promise<Buffer> {
    const startedAt = performance.now();
    const response = await fetch(url, {
      headers: { referer: "http://www.dm5.com/dm5api/" },
    });
    trackerLogger.debug(
      {
        trackerId: this.id,
        operation: "getImage",
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "tracker source request completed",
    );
    if (!response.ok) {
      throw new Error(`MHR image request failed: ${String(response.status)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async request<T>(
    path: string,
    params: Record<string, string> = {},
    body?: unknown,
  ): Promise<T> {
    const signedParams: Record<string, string> = {
      ...params,
      ...BASE_PARAMS,
    };
    const bodyString = body === undefined ? undefined : JSON.stringify(body);
    const hashItems = [HASH_KEY];

    if (bodyString) {
      hashItems.push("POST", "body", bodyString);
    } else {
      hashItems.push("GET");
    }
    for (const key of Object.keys(signedParams).sort()) {
      hashItems.push(key, signedParams[key]!);
    }
    hashItems.push(HASH_KEY);

    const encoded = encodeURIComponent(hashItems.join("")).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    signedParams.gsn = createHash("md5").update(encoded).digest("hex");

    const url = new URL(path, BASE_URL);
    url.search = new URLSearchParams(signedParams).toString();
    const method = bodyString ? "POST" : "GET";
    const startedAt = performance.now();
    const response = await fetch(url, {
      method,
      headers: {
        ...BASE_HEADERS,
        ...(bodyString ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyString,
    });
    trackerLogger.debug(
      {
        trackerId: this.id,
        operation: "request",
        method,
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "tracker source request completed",
    );
    if (!response.ok) {
      throw new Error(`MHR request failed: ${String(response.status)}`);
    }

    return ((await response.json()) as { response: T }).response;
  }
}
