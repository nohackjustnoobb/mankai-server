import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { useAppSession } from "#/utils/session.server";
import { verifyToken, type AccessTokenPayload } from "#/utils/jwt.server";

function uidFromAccessToken(token: string): string | null {
  let payload: AccessTokenPayload;
  try {
    payload = verifyToken<AccessTokenPayload>(token);
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }

  if ((payload as { type?: string }).type === "refresh") {
    throw new Response("Unauthorized", { status: 401 });
  }

  return payload.sub ?? null;
}

export const apiAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const authHeader = getRequestHeader("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);

  const userId = bearerMatch
    ? uidFromAccessToken(bearerMatch[1])
    : (await useAppSession()).data.userId;

  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return next({
    context: {
      userId,
    },
  });
});
