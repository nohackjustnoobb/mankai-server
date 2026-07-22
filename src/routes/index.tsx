import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";

import ThemeToggle from "#/components/ThemeToggle";
import { useNotification } from "#/components/notifications/useNotification";
import { loginFn } from "#/utils/auth.functions";
import styles from "./index.module.scss";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { notify } = useNotification();
  const login = useServerFn(loginFn);
  const search = useSearch({ strict: false }) as { redirect?: string };
  const redirectTo = search.redirect;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const result = await login({
        data: { email, password, redirectTo },
      });

      if (result?.error) {
        notify.failed(result.error, { title: "Login failed" });
        setSubmitting(false);
        setPassword("");
      }
    } catch (error) {
      notify.failed("Something went wrong. Please try again.", {
        title: "Login failed",
      });
      console.error(error);
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.login}>
      <div className={styles.themeToggleWrapper}>
        <ThemeToggle />
      </div>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/icon.png" alt="Mankai" className={styles.icon} />
          <h1 className={styles.title}>Mankai</h1>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <div className={styles.inputWrapper}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <div className={styles.inputWrapper}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowPassword((s) => !s)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <div className={styles.footer}>
          Don't have an account?{" "}
          <Link to="/signup" className={styles.link}>
            Sign up
          </Link>
        </div>
      </div>
    </main>
  );
}
