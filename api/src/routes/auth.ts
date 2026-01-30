import HyperExpress from "hyper-express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";
import crypto from "crypto";
import { User } from "@prisma/client";

// Extend HyperExpress Request type to include user property
declare module "hyper-express" {
  interface Request {
    payload?: TokenPayload;
  }
}

// JWT Configuration
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "secret";
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";

// JWT Helper Functions
interface TokenPayload {
  userId: number;
  email: string;
  passwordHash?: string;
  isAdmin: boolean;
  isRefreshKey?: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, isRefreshKey: false, passwordHash: undefined },
    JWT_ACCESS_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN as any,
    },
  );
}

function generatePasswordHash(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateRefreshToken(payload: TokenPayload): string {
  let hashedPayload = { ...payload, isRefreshKey: true, isAdmin: undefined };
  if (payload.passwordHash)
    hashedPayload.passwordHash = generatePasswordHash(payload.passwordHash);

  return jwt.sign(hashedPayload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN as any,
  });
}

function generateTokens(payload: TokenPayload): TokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { accessToken, refreshToken };
}

function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
    if (decoded.isRefreshKey) return null;

    return decoded;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function verifyRefreshToken(
  token: string,
): Promise<{ payload: TokenPayload | null; user: User | null }> {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
    if (!decoded.isRefreshKey) return { payload: null, user: null };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    if (!user) return { payload: null, user: null };

    const storedHash = generatePasswordHash(user.password);
    if (decoded.passwordHash !== storedHash)
      return { payload: null, user: null };

    return { payload: decoded, user };
  } catch (error) {
    console.error(error);
    return { payload: null, user: null };
  }
}

function validatePassword(password: string): boolean {
  return !(
    password.length < 8 ||
    password.length > 100 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  );
}

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

// Middleware for protecting routes
const requireAuth: HyperExpress.MiddlewareHandler = (
  request,
  response,
  next,
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return response.status(401).json({ error: "Access token required" });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const payload = verifyAccessToken(token);

  if (!payload) {
    return response
      .status(401)
      .json({ error: "Invalid or expired access token" });
  }

  // Add payload to request
  request.payload = payload;
  next();
};

function setupAuthEndpoints(server: HyperExpress.Server) {
  // User Login
  server.post("/api/auth/login", async (request, response) => {
    try {
      const { username, password } = await request.json();

      // Validation
      if (!username || !password) {
        return response
          .status(400)
          .json({ error: "Email and password are required" });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: username },
      });

      if (!user) {
        return response.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        return response.status(401).json({ error: "Invalid credentials" });
      }

      // Generate tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        passwordHash: user.password,
        isAdmin: user.isAdmin,
      };

      const tokens = generateTokens(tokenPayload);

      response.status(200).json({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        ...tokens,
      });
    } catch (error) {
      console.error(error);
      response.status(400).json({ error: "User login failed" });
    }
  });

  // Token Refresh
  server.post("/api/auth/refresh", async (request, response) => {
    try {
      const { refreshToken } = await request.json();

      if (!refreshToken) {
        return response
          .status(400)
          .json({ error: "Refresh token is required" });
      }

      // Verify refresh token
      const { payload, user } = await verifyRefreshToken(refreshToken);
      if (!payload) {
        return response
          .status(401)
          .json({ error: "Invalid or expired refresh token" });
      }

      if (!user) {
        return response.status(401).json({ error: "User not found" });
      }

      // Generate new token pair
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
      };

      const tokens = generateAccessToken(tokenPayload);

      response.status(200).json({
        message: "Tokens refreshed successfully",
        accessToken: tokens,
      });
    } catch (error) {
      console.error(error);
      response.status(400).json({ error: "Token refresh failed" });
    }
  });
}

export {
  setupAuthEndpoints,
  requireAuth,
  hashPassword,
  validatePassword,
  generateTokens,
  verifyPassword,
};
export type { TokenPayload };
