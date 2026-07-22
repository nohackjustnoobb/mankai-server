import { ChevronDown } from "lucide-react";
import { useState } from "react";
import styles from "./DropdownSelector.module.scss";

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
};

type DropdownSelectorProps<T extends string> = {
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
};

export default function DropdownSelector<T extends string>({
  options,
  value,
  onChange,
  placeholder = "Select an option",
}: DropdownSelectorProps<T>) {
  const [open, setOpen] = useState(false);

  const handleSelect = (next: T) => {
    setOpen(false);
    onChange(next);
  };

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? placeholder;

  return (
    <div
      className={styles.dropdown}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className={styles.trigger} title={selectedLabel}>
        <span className={styles.label}>{selectedLabel}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              className={styles.option}
              onClick={() => handleSelect(option.value)}
              title={option.label}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
