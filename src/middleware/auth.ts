import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { useAppSession } from "#/utils/session.server";
import { verifyToken, type AccessTokenPayload } from "#/utils/jwt.server";

function authFromAccessToken(token: string) {
  let payload: AccessTokenPayload;
  try {
    payload = verifyToken<AccessTokenPayload>(token);
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }

  if ((payload as { type?: string }).type === "refresh") {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { userId: payload.sub, role: payload.role };
}

export const apiAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const authHeader = getRequestHeader("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);

  const auth = bearerMatch
    ? authFromAccessToken(bearerMatch[1])
    : (await useAppSession()).data;

  if (
    !auth.userId ||
    (auth.role !== "admin" && auth.role !== "member")
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return next({
    context: {
      userId: auth.userId,
      role: auth.role,
    },
  });
});
