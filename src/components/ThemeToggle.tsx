import { useTheme } from "@lonik/themer";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.scss";

const themeOrder = ["system", "light", "dark"] as const;
type ThemeValue = (typeof themeOrder)[number];

function nextTheme(value: ThemeValue): ThemeValue {
  const index = themeOrder.indexOf(value);
  return themeOrder[(index + 1) % themeOrder.length]!;
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const currentTheme: ThemeValue = (theme as ThemeValue) ?? "system";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const themeIcon =
    currentTheme === "light" ? (
      <Sun size={20} />
    ) : currentTheme === "dark" ? (
      <Moon size={20} />
    ) : (
      <SunMoon size={20} />
    );

  return (
    <button
      suppressHydrationWarning
      className={styles.themeToggle}
      onClick={() => setTheme(nextTheme(currentTheme))}
      title={"Switch Theme"}
    >
      {mounted && themeIcon}
    </button>
  );
}
