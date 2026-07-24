import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";

import db from "#/lib/db.server";
import { user } from "#/db/schema";
import { useAppSession } from "#/utils/session.server";

export type AuthUser = {
  id: string;
  email: string;
  role: "admin" | "member";
};

type LoginInput = {
  email: string;
  password: string;
  redirectTo?: string;
};

async function getUserById(
  id: string,
  includeInactive = false,
): Promise<AuthUser | null> {
  const user = await db.query.user.findFirst({
    where: {
      id,
      isActive: includeInactive ? undefined : true,
    },
    columns: {
      id: true,
      email: true,
      role: true,
    },
  });

  return user ?? null;
}

async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const user = await db.query.user.findFirst({
    where: {
      email,
      isActive: true,
    },
  });

  if (!user) return null;

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) return null;

  return { id: user.id, email: user.email, role: user.role };
}

// Login server function
export const loginFn = createServerFn({ method: "POST" })
  .validator((data: LoginInput) => data)
  .handler(async ({ data }) => {
    const user = await authenticateUser(data.email, data.password);

    if (!user) {
      return { error: "Invalid credentials" } as const;
    }

    const session = await useAppSession();
    await session.update({ userId: user.id, role: user.role });

    throw redirect({ to: data.redirectTo || "/dashboard" });
  });

type SignupInput = {
  email: string;
  password: string;
};

// Signup server function — creates a user that requires admin activation.
export const signupFn = createServerFn({ method: "POST" })
  .validator((data: SignupInput) => data)
  .handler(async ({ data }) => {
    const existing = await db.query.user.findFirst({
      where: { email: data.email },
      columns: { id: true },
    });

    if (existing) {
      return { error: "An account with that email already exists" } as const;
    }

    const hashedPassword = await Bun.password.hash(data.password);

    try {
      await db.insert(user).values({
        email: data.email,
        password: hashedPassword,
        isActive: false,
      });
    } catch (error) {
      console.error(error);
      return { error: "Could not create account. Please try again." } as const;
    }

    return { ok: true } as const;
  });

// Logout server function
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useAppSession();
  await session.clear();
  throw redirect({ to: "/" });
});

// Get current user
export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) return null;

    return await getUserById(userId);
  },
);
