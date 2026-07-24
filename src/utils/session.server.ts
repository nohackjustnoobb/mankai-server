import { useSession } from "@tanstack/react-start/server";

export type AppSessionData = {
  userId?: string;
  role?: "admin" | "member";
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET environment variable is required in production (must be at least 32 characters).",
      );
    }
    return "dev-only-session-secret-change-in-production-min-32-chars!!";
  }
  return secret;
}

export function useAppSession() {
  return useSession<AppSessionData>({
    name: "mankai-session",
    password: getSessionSecret(),
    cookie: {
      secure: process.env.FORCE_SECURE_COOKIE === "true",
      sameSite: "lax",
      httpOnly: true,
    },
  });
}
