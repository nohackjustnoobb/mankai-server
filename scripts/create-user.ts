import {
  intro,
  outro,
  text,
  password,
  select,
  spinner,
  note,
  cancel,
  isCancel,
} from "@clack/prompts";

import db from "#/lib/db.server";
import { user } from "#/db/schema";

intro("Create a user");

const email = await text({
  message: "Email:",
  validate: (v) => {
    if (!v || !v.trim().includes("@"))
      return "Please enter a valid email address";
  },
});
if (isCancel(email)) {
  cancel("Aborted.");
  process.exit(0);
}

const pw = await password({
  message: "Password:",
  validate: (v) => {
    if (!v || v.length < 8) return "Password must be at least 8 characters";
  },
});
if (isCancel(pw)) {
  cancel("Aborted.");
  process.exit(0);
}

const confirmPw = await password({
  message: "Confirm password:",
  validate: (v) => {
    if (v !== pw) return "Passwords do not match";
  },
});
if (isCancel(confirmPw)) {
  cancel("Aborted.");
  process.exit(0);
}

const role = await select<"admin" | "member">({
  message: "Role:",
  options: [
    { value: "member", label: "member" },
    { value: "admin", label: "admin" },
  ],
});
if (isCancel(role)) {
  cancel("Aborted.");
  process.exit(0);
}

const s = spinner();
s.start("Hashing password and inserting user…");

const hashed = await Bun.password.hash(pw);

try {
  const [created] = await db
    .insert(user)
    .values({
      email: email.trim(),
      isActive: true,
      password: hashed,
      role,
    })
    .returning();

  s.stop("User created");
  note(
    [
      `id:         ${created.id}`,
      `email:      ${created.email}`,
      `role:       ${created.role}`,
      `api_key:    ${created.apiKey ?? "—"}`,
      `is_active:  ${created.isActive}`,
      `created_at: ${created.createdAt.toISOString()}`,
    ].join("\n"),
    "Created user",
  );
  outro("Done.");
} catch (err) {
  s.stop("Failed");
  cancel(`Failed to create user: ${err}`);
  process.exit(1);
}

process.exit(0);
