import { createFileRoute } from "@tanstack/react-router";
import { apiAuthMiddleware } from "#/middleware/auth.ts";

const IMAGES_DIR = "./data/images";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ImageKind = "manga" | "chapter";

function parseSplat(
  splat: string | undefined,
): { kind: ImageKind; id: string } | null {
  if (!splat) return null;
  const segments = splat.split("/");
  if (segments.length !== 2) return null;

  const [kind, file] = segments as [string, string];
  if (kind !== "manga" && kind !== "chapter") return null;
  if (!file.endsWith(".webp")) return null;

  const id = file.slice(0, -".webp".length);
  if (!UUID_RE.test(id)) return null;

  return { kind: kind as ImageKind, id };
}

export const Route = createFileRoute("/api/image/$")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params }) => {
        const parsed = parseSplat(params._splat);
        if (!parsed) {
          return new Response("Not found", { status: 404 });
        }

        const { kind, id } = parsed;
        const file = Bun.file(`${IMAGES_DIR}/${kind}/${id}.webp`);
        if (!(await file.exists())) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(file, {
          headers: {
            "Content-Type": "image/webp",
          },
        });
      },
    },
  },
});
