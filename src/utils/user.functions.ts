import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, eq, ilike } from "drizzle-orm";

import db from "#/lib/db.server";
import { generateApiKey, user } from "#/db/schema";
import { useAppSession } from "#/utils/session.server";

// ---------- Upsert User ----------

export type UpsertUserInput = {
  id?: string;
  email: string;
  password?: string;
  isActive: boolean;
};

export type UpsertUserResult =
  { ok: true; id: string; created: boolean } | { ok: false; error: string };

export const upsertUserFn = createServerFn({ method: "POST" })
  .validator((data: UpsertUserInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" } as const;
    }

    // Verify the current user is an active admin
    const currentUser = await db.query.user.findFirst({
      where: { id: userId, isActive: true },
      columns: { role: true },
    });
    if (currentUser?.role !== "admin") {
      return {
        ok: false,
        error: "Forbidden: only admins can manage users",
      } as const;
    }

    const email = data.email?.trim();
    if (!email) {
      return { ok: false, error: "Email is required" } as const;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Invalid email address" } as const;
    }

    const id = data.id?.trim() || undefined;
    const isActive = data.isActive;

    let existing:
      { id: string; role: "admin" | "member"; email: string } | undefined;

    if (id) {
      existing = await db.query.user.findFirst({
        where: { id },
        columns: { id: true, role: true, email: true },
      });
      if (!existing) {
        return { ok: false, error: "User not found" } as const;
      }

      // Admin accounts cannot be modified through this function.
      if (existing.role === "admin") {
        return {
          ok: false,
          error: "Admin accounts cannot be modified",
        } as const;
      }
    }

    // Email uniqueness check.
    if (!id || existing!.email !== email) {
      const conflict = await db.query.user.findFirst({
        where: { email },
        columns: { id: true },
      });
      if (conflict && conflict.id !== id) {
        return {
          ok: false,
          error: "An account with that email already exists",
        } as const;
      }
    }

    const password = data.password?.trim() ?? "";
    if (!id && password.length < 8) {
      return {
        ok: false,
        error: "Password must be at least 8 characters",
      } as const;
    }
    if (password && password.length < 8) {
      return {
        ok: false,
        error: "Password must be at least 8 characters",
      } as const;
    }

    const hashedPassword = password ? await Bun.password.hash(password) : null;

    try {
      const [row] = await db
        .insert(user)
        .values({
          id,
          email,
          password: hashedPassword ?? "",
          role: "member",
          isActive,
        })
        .onConflictDoUpdate({
          target: user.id,
          set: {
            email,
            ...(hashedPassword ? { password: hashedPassword } : {}),
            isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) {
        return { ok: false, error: "Could not save user" } as const;
      }

      return { ok: true, id: row.id, created: !id } as const;
    } catch (err) {
      console.error("Failed to upsert user:", err);
      return {
        ok: false,
        error: "Could not save user. Please try again.",
      } as const;
    }
  });

// ---------- Get App Login URL ----------

export type GetApiUrlResult =
  { ok: true; url: string } | { ok: false; error: string };

function getApiBaseUrl(): string {
  const envBase = process.env.BASE_API_URL?.trim().replace(/\/$/, "");
  return envBase
    ? envBase
    : `${
        getRequestUrl({
          xForwardedHost: true,
          xForwardedProto: true,
        }).origin
      }/api`;
}

function buildUserApiUrl(base: string, email: string, apiKey: string): string {
  const url = new URL(base);
  url.searchParams.set("username", email);
  url.searchParams.set("password", apiKey);
  return url.toString();
}

export const getApiUrlFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      return { ok: false, error: "Unauthorized" } as const;
    }

    const row = await db.query.user.findFirst({
      where: { id: userId, isActive: true },
      columns: { email: true, apiKey: true },
    });
    if (!row) {
      return { ok: false, error: "Unauthorized" } as const;
    }

    return {
      ok: true,
      url: buildUserApiUrl(getApiBaseUrl(), row.email, row.apiKey),
    } as const;
  },
);

// ---------- Regenerate API URL ----------

export type RegenerateApiUrlInput = {
  id?: string;
};

export type RegenerateApiUrlResult =
  { ok: true; id: string; url: string } | { ok: false; error: string };

export const regenerateApiUrlFn = createServerFn({ method: "POST" })
  .validator((data: RegenerateApiUrlInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const currentUserId = session.data.userId;
    if (!currentUserId) {
      return { ok: false, error: "Unauthorized" } as const;
    }

    const targetId = data.id?.trim() || currentUserId;
    const targetingSelf = targetId === currentUserId;

    // The current user must be active.
    const currentUser = await db.query.user.findFirst({
      where: { id: currentUserId, isActive: true },
      columns: { role: true },
    });
    if (!currentUser) {
      return { ok: false, error: "Unauthorized" } as const;
    }

    // Targeting another user requires an admin.
    if (!targetingSelf && currentUser.role !== "admin") {
      return {
        ok: false,
        error: "Forbidden: only admins can regenerate other users' API URLs",
      } as const;
    }

    const target = await db.query.user.findFirst({
      where: { id: targetId },
      columns: { role: true, email: true },
    });
    if (!target) {
      return { ok: false, error: "User not found" } as const;
    }

    // Admin accounts cannot have their API URL regenerated by another admin.
    if (!targetingSelf && target.role === "admin") {
      return {
        ok: false,
        error: "Admin accounts cannot be modified",
      } as const;
    }

    const newApiKey = generateApiKey();

    try {
      const [updated] = await db
        .update(user)
        .set({ apiKey: newApiKey, updatedAt: new Date() })
        .where(eq(user.id, targetId))
        .returning({ id: user.id, email: user.email });

      if (!updated) {
        return { ok: false, error: "Could not regenerate API URL" } as const;
      }

      return {
        ok: true,
        id: updated.id,
        url: buildUserApiUrl(getApiBaseUrl(), updated.email, newApiKey),
      } as const;
    } catch (err) {
      console.error("Failed to regenerate API URL:", err);
      return {
        ok: false,
        error: "Could not regenerate API URL. Please try again.",
      } as const;
    }
  });

// ---------- Fetch Users ----------

export type FetchUserInput = {
  role?: "admin" | "member";
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type UserListItem = Omit<
  typeof user.$inferSelect,
  "password" | "apiKey"
> & { apiUrl?: string };

export type FetchUserResult = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_USER_PAGE_SIZE = 25;
const MAX_USER_PAGE_SIZE = 50;

export const fetchUsersFn = createServerFn({ method: "GET" })
  .validator((data: FetchUserInput) => data)
  .handler(async ({ data }) => {
    // Check session
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Verify the current user is an active admin
    const currentUser = await db.query.user.findFirst({
      where: { id: userId, isActive: true },
      columns: { role: true },
    });
    if (currentUser?.role !== "admin") {
      throw new Error("Forbidden: only admins can list users");
    }

    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(
      MAX_USER_PAGE_SIZE,
      Math.max(1, data.pageSize ?? DEFAULT_USER_PAGE_SIZE),
    );

    const search = typeof data.search === "string" ? data.search.trim() : "";

    const conditions = [];
    if (data.role) conditions.push(eq(user.role, data.role));
    if (typeof data.isActive === "boolean")
      conditions.push(eq(user.isActive, data.isActive));
    if (search) conditions.push(ilike(user.email, `%${search}%`));
    const whereSql = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, total] = await Promise.all([
      db.query.user.findMany({
        where: {
          role: data.role,
          isActive: data.isActive,
          email: search ? { ilike: `%${search}%` } : undefined,
        },
        columns: {
          password: false,
        },
        orderBy: { createdAt: "desc" },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      db.$count(user, whereSql),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const baseUrl = getApiBaseUrl();

    return {
      items: rows.map(({ apiKey, ...rest }) =>
        rest.role === "admin"
          ? rest
          : { ...rest, apiUrl: buildUserApiUrl(baseUrl, rest.email, apiKey) },
      ),
      total,
      page,
      pageSize,
      totalPages,
    };
  });
