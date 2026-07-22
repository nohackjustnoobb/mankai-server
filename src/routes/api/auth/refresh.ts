import { createFileRoute } from "@tanstack/react-router";

import db from "#/lib/db.server";
import {
  signAccessToken,
  verifyToken,
  type RefreshTokenPayload,
} from "#/utils/jwt.server";

type RefreshBody = {
  refreshToken: string;
};

type RefreshResponse = {
  message: string;
  accessToken: string;
};

export const Route = createFileRoute("/api/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: RefreshBody;
        try {
          body = (await request.json()) as RefreshBody;
        } catch {
          return Response.json(
            { message: "Invalid JSON body" },
            { status: 400 },
          );
        }

        const refreshToken = body.refreshToken?.trim();

        if (!refreshToken) {
          return Response.json(
            { message: "refreshToken is required" },
            { status: 400 },
          );
        }

        let payload: RefreshTokenPayload;
        try {
          payload = verifyToken<RefreshTokenPayload>(refreshToken);
        } catch {
          return Response.json(
            { message: "Invalid or expired refresh token" },
            { status: 401 },
          );
        }

        if (payload.type !== "refresh" || !payload.sub) {
          return Response.json(
            { message: "Invalid refresh token" },
            { status: 401 },
          );
        }

        const row = await db.query.user.findFirst({
          where: { id: payload.sub, isActive: true },
          columns: { id: true, email: true, role: true },
        });

        if (!row) {
          return Response.json(
            { message: "Invalid or expired refresh token" },
            { status: 401 },
          );
        }

        const accessToken = signAccessToken({
          sub: row.id,
          email: row.email,
          role: row.role,
        });

        const response: RefreshResponse = {
          message: "Token refreshed",
          accessToken,
        };

        return Response.json(response);
      },
    },
  },
});
