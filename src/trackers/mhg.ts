import { decompressFromBase64 } from "lz-string";

import { trackerLogger } from "#/lib/logger.server.ts";
import Tracker, {
  type TrackerChapter,
  type TrackerManga,
} from "#/trackers/tracker.ts";
import { Genre, Status } from "#/utils/types.ts";

const MHG_BASE_URL = "https://tw.manhuagui.com/";
const MHG_IMAGE_ORIGIN = "https://i.hamreus.com";
const MHG_REFERER = "https://tw.manhuagui.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const GENRES: Record<string, Genre> = {
  rexue: Genre.Action,
  aiqing: Genre.Romance,
  xiaoyuan: Genre.SchoolLife,
  baihe: Genre.Yuri,
  danmei: Genre.BoysLove,
  maoxian: Genre.Adventure,
  hougong: Genre.Harem,
  kehuan: Genre.SpeculativeFiction,
  zhanzheng: Genre.War,
  xuanyi: Genre.Suspense,
  tuili: Genre.Suspense,
  gaoxiao: Genre.Comedy,
  mohuan: Genre.Magic,
  mofa: Genre.Magic,
  kongbu: Genre.Horror,
  shengui: Genre.Horror,
  lishi: Genre.Historical,
  jingji: Genre.Sports,
  jizhan: Genre.Mecha,
  weiniang: Genre.Otokonoko,
};

type TextSlot = { chunks: string[] };

type RawChapterList = {
  uls: TrackerChapter[][];
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z\d]+);/gi,
    (entity, body: string) => {
      if (body.startsWith("#")) {
        const hexadecimal = body[1]?.toLowerCase() === "x";
        const digits = body.slice(hexadecimal ? 2 : 1);
        const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
        if (
          Number.isNaN(codePoint) ||
          codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return entity;
        }
        return String.fromCodePoint(codePoint);
      }

      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

function textValue(slot: TextSlot | undefined): string {
  return decodeHtmlEntities(slot?.chunks.join("") ?? "").trim();
}

function removeActive<T>(active: T[], value: T): void {
  const index = active.lastIndexOf(value);
  if (index >= 0) active.splice(index, 1);
}

function collectText(
  rewriter: HTMLRewriter,
  selector: string,
): { slots: TextSlot[] } {
  const slots: TextSlot[] = [];
  const active: TextSlot[] = [];

  rewriter.on(selector, {
    element(element) {
      const slot = { chunks: [] };
      slots.push(slot);
      active.push(slot);
      element.onEndTag(() => removeActive(active, slot));
    },
    text(text) {
      active.at(-1)?.chunks.push(text.text);
    },
  });

  return { slots };
}

function transformHtml(
  rewriter: HTMLRewriter,
  html: string,
  source: string,
): void {
  if (!html.trim()) throw new Error(`Invalid ${source}: empty document`);

  try {
    rewriter.transform(html);
  } catch (error) {
    throw new Error(`Invalid ${source}: HTML parsing failed`, { cause: error });
  }
}

function normalizeMhgLatestTitle(value: string): string {
  return value.trim().split(/\s+/u)[0]?.replace(/第/g, "") ?? "";
}

function parseMhgUpdateFeed(html: string): Map<string, string> {
  type UpdateItem = { href?: string; latest: TextSlot };

  const rewriter = new HTMLRewriter();
  const items: UpdateItem[] = [];
  const active: UpdateItem[] = [];
  let foundList = false;

  rewriter.on("div.latest-cont > div.latest-list", {
    element() {
      foundList = true;
    },
  });
  rewriter.on("div.latest-cont > div.latest-list > ul > li", {
    element(element) {
      const item = { latest: { chunks: [] } };
      items.push(item);
      active.push(item);
      element.onEndTag(() => removeActive(active, item));
    },
  });
  rewriter.on("div.latest-cont > div.latest-list > ul > li a", {
    element(element) {
      const item = active.at(-1);
      if (item && item.href === undefined) {
        item.href = element.getAttribute("href") ?? undefined;
      }
    },
  });
  rewriter.on("div.latest-cont > div.latest-list > ul > li a span.tt", {
    text(text) {
      active.at(-1)?.latest.chunks.push(text.text);
    },
  });

  transformHtml(rewriter, html, "MHG update feed");
  if (!foundList) {
    throw new Error("Invalid MHG update feed: missing update list");
  }

  const updates = new Map<string, string>();
  for (const item of items) {
    const id = decodeHtmlEntities(item.href ?? "").match(/\d+/)?.[0];
    const revision = normalizeMhgLatestTitle(
      textValue(item.latest)
        .replace(/更新至|共/g, "")
        .trim(),
    );
    if (id && revision) updates.set(id, revision);
  }

  if (updates.size === 0) {
    throw new Error("Invalid MHG update feed: no updates found");
  }
  return updates;
}

function parseChapterMarkup(
  html: string,
  headingSelector: string,
  source: string,
): Record<string, TrackerChapter[]> {
  const rewriter = new HTMLRewriter();
  const headings = collectText(rewriter, headingSelector);
  const lists: RawChapterList[] = [];
  const activeLists: RawChapterList[] = [];
  const activeUls: TrackerChapter[][] = [];

  rewriter.on("div.chapter-list", {
    element(element) {
      const list = { uls: [] };
      lists.push(list);
      activeLists.push(list);
      element.onEndTag(() => removeActive(activeLists, list));
    },
  });
  rewriter.on("div.chapter-list ul", {
    element(element) {
      const list = activeLists.at(-1);
      if (!list) return;
      const ul: TrackerChapter[] = [];
      list.uls.push(ul);
      activeUls.push(ul);
      element.onEndTag(() => removeActive(activeUls, ul));
    },
  });
  rewriter.on("div.chapter-list ul > li > a", {
    element(element) {
      const ul = activeUls.at(-1);
      if (!ul) return;

      const href = decodeHtmlEntities(element.getAttribute("href") ?? "")
        .trim()
        .split(/[?#]/u, 1)[0];
      const id = (href?.split("/").filter(Boolean).at(-1) ?? "").replace(
        /\.html$/u,
        "",
      );
      if (!id) return;
      const title = decodeHtmlEntities(element.getAttribute("title") ?? "")
        .trim()
        .replace("话", "話");
      ul.push(title ? { id, title } : { id });
    },
  });

  transformHtml(rewriter, html, source);
  if (lists.length === 0) {
    throw new Error(`Invalid ${source}: missing chapter lists`);
  }

  const chapters: Record<string, TrackerChapter[]> = {};
  let chapterCount = 0;
  for (let index = 0; index < lists.length; index++) {
    const heading = textValue(headings.slots[index]);
    let groupName = heading || `Group ${String(index + 1)}`;
    if (heading.includes("單話") || heading.includes("单话")) {
      groupName = "serial";
    } else if (heading.includes("單行本") || heading.includes("单行本")) {
      groupName = "volume";
    } else if (heading.includes("番外篇")) {
      groupName = "extra";
    }
    const group = (chapters[groupName] ??= []);

    for (const ul of lists[index]!.uls) {
      const ordered = [...ul].reverse();
      group.push(...ordered);
      chapterCount += ordered.length;
    }
  }

  if (chapterCount === 0) {
    throw new Error(`Invalid ${source}: no chapters found`);
  }
  return chapters;
}

function parseMhgManga(id: string, html: string): TrackerManga {
  const rewriter = new HTMLRewriter();
  let foundBookCover = false;
  let coverImage: { alt?: string; src?: string } | undefined;
  let ended = false;
  let viewstate: string | undefined;

  rewriter.on("div.book-cover", {
    element() {
      foundBookCover = true;
    },
  });
  rewriter.on("div.book-cover img", {
    element(element) {
      coverImage ??= {
        alt: element.getAttribute("alt") ?? undefined,
        src:
          element.getAttribute("src") ||
          element.getAttribute("data-src") ||
          undefined,
      };
    },
  });
  rewriter.on("div.book-cover span.finish", {
    element() {
      ended = true;
    },
  });
  rewriter.on("#__VIEWSTATE", {
    element(element) {
      viewstate ??= element.getAttribute("value") ?? "";
    },
  });

  const latestText = collectText(rewriter, "div.book-cover span.text");
  const authorTexts = collectText(
    rewriter,
    "ul.detail-list > li:nth-child(2) > span:nth-child(2) > a",
  );
  const updatedText = collectText(
    rewriter,
    "li.status > span > span:nth-child(3)",
  );
  const descriptionText = collectText(rewriter, "div.book-intro > #intro-all");
  const genreHrefs: string[] = [];
  rewriter.on("ul.detail-list > li:nth-child(2) > span:nth-child(1) > a", {
    element(element) {
      genreHrefs.push(element.getAttribute("href") ?? "");
    },
  });

  transformHtml(rewriter, html, "MHG manga page");
  const title = decodeHtmlEntities(coverImage?.alt ?? "").trim();
  if (!foundBookCover || !coverImage || !title) {
    throw new Error("Invalid MHG manga page: missing book cover or title");
  }

  let chapterHtml = html;
  let headingSelector = "div.chapter > h4";
  let chapterSource = "MHG manga page";
  if (viewstate !== undefined) {
    const decompressed = decompressFromBase64(viewstate);
    if (!decompressed?.trim()) {
      throw new Error("Invalid MHG manga page: invalid compressed __VIEWSTATE");
    }
    chapterHtml = decompressed;
    headingSelector = "h4";
    chapterSource = "MHG compressed chapter markup";
  }
  const chapters = parseChapterMarkup(
    chapterHtml,
    headingSelector,
    chapterSource,
  );

  const latestTitle = textValue(latestText.slots[0])
    .replace(/更新至[：:]?/g, "")
    .trim();
  const authors = authorTexts.slots.map(textValue).filter(Boolean);
  const genres = genreHrefs.flatMap((href) => {
    const slug = decodeHtmlEntities(href).match(/\/list\/([^/]+)\//u)?.[1];
    const genre = slug ? GENRES[slug] : undefined;
    return genre === undefined ? [] : [genre];
  });
  const updatedAtText = textValue(updatedText.slots[0]);
  const description = textValue(descriptionText.slots[0]);
  let cover = decodeHtmlEntities(coverImage.src ?? "").trim();
  if (!cover) {
    throw new Error("Invalid MHG manga page: missing cover URL");
  }
  if (cover.startsWith("//")) {
    cover = `https:${cover}`;
  } else if (cover.startsWith("/")) {
    cover = new URL(cover, MHG_BASE_URL).href;
  }

  const result: TrackerManga = {
    id,
    title,
    cover,
    status: ended ? Status.Ended : Status.OnGoing,
    authors,
    genres,
    chapters,
    meta: normalizeMhgLatestTitle(latestTitle),
  };
  if (description) result.description = description;
  if (updatedAtText) {
    const updatedAt = Date.parse(updatedAtText);
    if (Number.isNaN(updatedAt)) {
      throw new Error("Invalid MHG manga page: invalid update date");
    }
    result.updatedAt = updatedAt;
  }

  return result;
}

function unpackChapterPayload(
  encoded: string,
  radix: number,
  count: number,
  valuesString: string,
): string {
  if (radix < 2 || radix > 62 || count < 0) {
    throw new Error("Invalid MHG chapter page: invalid packed payload header");
  }

  const values = valuesString.split("|");
  const digits =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const generateKey = (index: number): string => {
    const last = index % radix;
    const prefix = index < radix ? "" : generateKey(Math.floor(index / radix));
    return `${prefix}${last > 35 ? String.fromCharCode(last + 29) : digits[last]}`;
  };

  const pairs: Record<string, string> = {};
  for (let index = count - 1; index >= 0; index--) {
    const key = generateKey(index);
    pairs[key] = values[index] || key;
  }

  return encoded.replace(/\b\w+\b/g, (value) => pairs[value] ?? value);
}

function parseMhgChapterUrls(html: string): string[] {
  if (!html.trim()) throw new Error("Invalid MHG chapter page: empty document");

  const packed = html.match(
    /\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([A-Za-z\d+/|=]+)'/u,
  );
  if (!packed) {
    throw new Error("Invalid MHG chapter page: packed payload not found");
  }

  const radix = Number.parseInt(packed[2]!, 10);
  const count = Number.parseInt(packed[3]!, 10);
  const values = decompressFromBase64(packed[4]!);
  if (!values) {
    throw new Error("Invalid MHG chapter page: packed values are invalid");
  }

  const decoded = unpackChapterPayload(packed[1]!, radix, count, values);
  const prefix = "SMH.imgData(";
  const suffix = ").preInit();";
  const start = decoded.indexOf(prefix);
  const end = decoded.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0) {
    throw new Error("Invalid MHG chapter page: image data call not found");
  }

  let data: unknown;
  try {
    data = JSON.parse(decoded.slice(start + prefix.length, end));
  } catch (error) {
    throw new Error("Invalid MHG chapter page: image data is not JSON", {
      cause: error,
    });
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !("path" in data) ||
    typeof data.path !== "string" ||
    !data.path.trim() ||
    !("files" in data) ||
    !Array.isArray(data.files)
  ) {
    throw new Error("Invalid MHG chapter page: malformed image data");
  }

  const files = data.files;
  if (
    files.length === 0 ||
    files.some((file) => typeof file !== "string" || !file.trim())
  ) {
    throw new Error("Invalid MHG chapter page: no image files found");
  }

  const pathBody = data.path.trim().replace(/^\/+|\/+$/g, "");
  const path = `/${pathBody}/`;
  return files.map(
    (file) => `${MHG_IMAGE_ORIGIN}${path}${file.trim().replace(/^\/+/, "")}`,
  );
}

export default class MhgTracker extends Tracker {
  readonly id = "mhg";
  readonly name = "漫畫櫃";
  readonly description = "Tracks manga from 漫畫櫃 using the MHG website.";
  readonly invalidMangaIdMessage =
    "MHG Manga ID must be a positive decimal number or an MHG comic URL";
  updateInterval = 5 * 60_000;
  getUpdatesTimeout = 10_000;
  getMangaTimeout = 10_000;
  getChapterTimeout = 10_000;
  getImageTimeout = 500;

  normalizeMangaId(id: string): string {
    const value = id.trim();

    try {
      const url = new URL(value);
      const supportedHost =
        url.hostname === "www.manhuagui.com" ||
        url.hostname === "tw.manhuagui.com";
      const match = url.pathname.match(/^\/comic\/([1-9]\d*)\/?$/);
      if (supportedHost && match) {
        return match[1]!;
      }
    } catch {}

    return value;
  }

  validateMangaId(id: string): boolean {
    return /^[1-9]\d*$/.test(id);
  }

  async getUpdates(mangas: TrackerManga[]) {
    if (mangas.length === 0) return [];

    const revisions = parseMhgUpdateFeed(
      await this.requestHtml("/update/d7.html"),
    );

    return mangas.map((manga) => {
      const revision = revisions.get(manga.id);
      return {
        id: manga.id,
        needsUpdate: revision === undefined ? false : revision !== manga.meta,
      };
    });
  }

  async getManga(id: string): Promise<TrackerManga> {
    const html = await this.requestHtml(`/comic/${id}/`);
    return parseMhgManga(id, html);
  }

  async getChapter(
    manga: TrackerManga,
    chapter: TrackerChapter,
  ): Promise<string[]> {
    const html = await this.requestHtml(
      `/comic/${manga.id}/${chapter.id}.html`,
    );
    return parseMhgChapterUrls(html);
  }

  async getImage(url: string): Promise<Buffer> {
    const startedAt = performance.now();
    const response = await fetch(url, {
      headers: {
        Referer: MHG_REFERER,
        "User-Agent": USER_AGENT,
      },
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
      throw new Error(`MHG image request failed: ${String(response.status)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async requestHtml(path: string): Promise<string> {
    const url = new URL(path, MHG_BASE_URL);
    const startedAt = performance.now();
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    trackerLogger.debug(
      {
        trackerId: this.id,
        operation: "request",
        method: "GET",
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "tracker source request completed",
    );
    if (!response.ok) {
      throw new Error(`MHG request failed: ${String(response.status)}`);
    }

    return response.text();
  }
}
