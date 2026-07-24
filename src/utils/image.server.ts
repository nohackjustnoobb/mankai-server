export const IMAGES_DIR = "./data/images";
export const MANGA_IMAGES_DIR = `${IMAGES_DIR}/manga`;
export const CHAPTER_IMAGES_DIR = `${IMAGES_DIR}/chapter`;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BASE64_IMAGE_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function parseChapterImageReference(reference: string): string | null {
  const value = reference.trim();
  if (IMAGE_UUID_RE.test(value)) return value.toLowerCase();

  try {
    const url = new URL(value, "http://mankai.local");
    const segments = url.pathname.split("/").filter(Boolean);
    const file = segments.at(-1);
    if (
      segments.at(-2) !== "chapter" ||
      segments.at(-3) !== "image" ||
      !file?.toLowerCase().endsWith(".webp")
    ) {
      return null;
    }

    const id = file.slice(0, -".webp".length);
    return IMAGE_UUID_RE.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}
