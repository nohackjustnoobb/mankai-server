import jwt, { type JwtPayload } from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: "admin" | "member";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
  jti: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable is required in production (must be at least 32 characters).",
      );
    }
    return "dev-only-jwt-secret-change-in-production-min-32-chars!!";
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

export function verifyToken<T extends JwtPayload = JwtPayload>(
  token: string,
): T {
  return jwt.verify(token, getJwtSecret()) as T;
}
