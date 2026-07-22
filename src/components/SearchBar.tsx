import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { fetchMangasFn } from "#/utils/manga.functions";
import { fetchUsersFn } from "#/utils/user.functions";

import styles from "./SearchBar.module.scss";

type SearchKind = "manga" | "user";

type SearchBarProps = {
  kind: SearchKind;
};

const DEBOUNCE_MS = 200;
const BLUR_DELAY_MS = 150;
const SUGGESTION_LIMIT = 5;

export default function SearchBar({ kind }: SearchBarProps) {
  const navigate = useNavigate();
  const fetchMangas = useServerFn(fetchMangasFn);
  const fetchUsers = useServerFn(fetchUsersFn);

  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  // Clear state and cancel in-flight requests when the section switches.
  useEffect(() => {
    reqIdRef.current += 1;
    setValue("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }, [kind]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  async function fetchSuggestions(query: string) {
    const reqId = (reqIdRef.current += 1);
    try {
      let labels: string[];

      if (kind === "manga") {
        const result = await fetchMangas({
          data: { search: query, page: 1, pageSize: SUGGESTION_LIMIT },
        });
        labels = result.items
          .map((m) => m.title?.trim())
          .filter((title): title is string => Boolean(title));
      } else {
        const result = await fetchUsers({
          data: { search: query, page: 1, pageSize: SUGGESTION_LIMIT },
        });
        labels = result.items.map((u) => u.email.trim());
      }

      if (reqId !== reqIdRef.current) return;
      const unique = Array.from(new Set(labels));
      setSuggestions(unique);
      setOpen(unique.length > 0);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      // fetchUsersFn throws for non-admins; just show no suggestions.
      console.error(err);
      setSuggestions([]);
      setOpen(false);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(next);
    }, DEBOUNCE_MS);
  }

  function navigateTo(target: string) {
    const search = target.trim();
    if (!search) return;
    navigate({
      to: kind === "user" ? "/dashboard/user" : "/dashboard",
      search: { search },
    });
    setValue("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        navigateTo(suggestions[activeIndex]!);
      } else {
        navigateTo(value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleFocus() {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
      blurRef.current = null;
    }
    if (value.trim() && suggestions.length > 0) setOpen(true);
  }

  function handleBlur() {
    blurRef.current = setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, BLUR_DELAY_MS);
  }

  function handleSuggestionSelect(suggestion: string) {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
      blurRef.current = null;
    }
    navigateTo(suggestion);
  }

  const showDropdown = open && suggestions.length > 0;

  return (
    <div className={styles.search}>
      <Search size={16} className={styles.searchIcon} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={kind === "user" ? "Search users…" : "Search manga…"}
        className={styles.searchInput}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <ul className={styles.suggestions} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? `${styles.suggestion} ${styles.active}`
                  : styles.suggestion
              }
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSuggestionSelect(suggestion);
              }}
              title={suggestion}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
