import { createFileRoute } from "@tanstack/react-router";

import db from "#/lib/db.server";
import { signAccessToken, signRefreshToken } from "#/utils/jwt.server";

type LoginBody = {
  username: string;
  password: string;
};

type LoginUser = {
  id: string;
  email: string;
  role: "admin" | "member";
};

async function authenticateApiUser(
  email: string,
  password: string,
): Promise<LoginUser | null> {
  const row = await db.query.user.findFirst({
    where: { email, isActive: true },
    columns: {
      id: true,
      email: true,
      role: true,
      password: true,
      apiKey: true,
    },
  });

  if (!row) return null;

  const passwordValid = await Bun.password.verify(password, row.password);
  const apiKeyValid = password === row.apiKey;

  if (!passwordValid && !apiKeyValid) return null;

  return { id: row.id, email: row.email, role: row.role };
}

type LoginResponse = {
  message: string;
  user: LoginUser;
  accessToken: string;
  refreshToken: string;
};

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: LoginBody;
        try {
          body = (await request.json()) as LoginBody;
        } catch {
          return Response.json(
            { message: "Invalid JSON body" },
            { status: 400 },
          );
        }

        const username = body.username?.trim();
        const password = body.password;

        if (!username || !password) {
          return Response.json(
            { message: "Username and password are required" },
            { status: 400 },
          );
        }

        const authedUser = await authenticateApiUser(username, password);

        if (!authedUser) {
          return Response.json(
            { message: "Invalid credentials" },
            { status: 401 },
          );
        }

        const accessToken = signAccessToken({
          sub: authedUser.id,
          email: authedUser.email,
          role: authedUser.role,
        });

        const refreshToken = signRefreshToken({
          sub: authedUser.id,
          type: "refresh",
          jti: crypto.randomUUID(),
        });

        const response: LoginResponse = {
          message: "Login successful",
          user: {
            id: authedUser.id,
            email: authedUser.email,
            role: authedUser.role,
          },
          accessToken,
          refreshToken,
        };

        return Response.json(response);
      },
    },
  },
});
