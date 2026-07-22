import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";

import ThemeToggle from "#/components/ThemeToggle";
import { useNotification } from "#/components/notifications/useNotification";
import { signupFn } from "#/utils/auth.functions";
import styles from "./signup.module.scss";

export const Route = createFileRoute("/signup")({ component: SignupView });

function SignupView() {
  const { notify } = useNotification();
  const signup = useServerFn(signupFn);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (password !== confirmPassword) {
      notify.failed("Passwords do not match.", { title: "Sign up failed" });
      return;
    }

    setSubmitting(true);

    try {
      const result = await signup({ data: { email, password } });

      if (result?.error) {
        notify.failed(result.error, { title: "Sign up failed" });
        setSubmitting(false);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      notify.success(
        "Account created. An admin needs to activate it before you can log in.",
        { title: "Account pending activation", duration: 0 },
      );
      navigate({ to: "/" });
    } catch (error) {
      notify.failed("Something went wrong. Please try again.", {
        title: "Sign up failed",
      });
      console.error(error);
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.signup}>
      <div className={styles.themeToggleWrapper}>
        <ThemeToggle />
      </div>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/icon.png" alt="Mankai" className={styles.icon} />
          <h1 className={styles.title}>Create your Mankai account</h1>
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
                autoComplete="new-password"
                minLength={8}
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
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirm password
            </label>
            <div className={styles.inputWrapper}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <div className={styles.footer}>
          Already have an account?{" "}
          <Link to="/" className={styles.link}>
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
