"use client";

// Number input that doesn't fight the user. Stores the in-progress text in
// local state and only commits a parsed number to the parent when the value
// is actually valid — so empty strings, leading zeros, and "0." while typing
// don't snap the cursor or revert to the min. Clamping happens on blur.

import { useState } from "react";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  decimals?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  autoFocus?: boolean;
  title?: string;
  onBlur?: () => void;
  onEscape?: () => void;
};

function format(n: number, decimals?: number) {
  if (decimals != null) return n.toFixed(decimals);
  return String(n);
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  integer = false,
  decimals,
  className,
  placeholder,
  disabled,
  ariaLabel,
  autoFocus,
  title,
  onBlur,
  onEscape,
}: Props) {
  const [text, setText] = useState(() => format(value, decimals));
  const [lastSeenValue, setLastSeenValue] = useState(value);

  // When the external `value` changes (e.g. clamped on blur, or set by a
  // sibling), re-derive the visible text. Done during render per React's
  // "you might not need an effect" guidance — no cascading renders.
  if (value !== lastSeenValue) {
    setLastSeenValue(value);
    setText(format(value, decimals));
  }

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      // Restore last good value on empty/partial input
      setText(format(value, decimals));
      return;
    }
    let n = integer ? parseInt(trimmed, 10) : parseFloat(trimmed);
    if (!Number.isFinite(n)) {
      setText(format(value, decimals));
      return;
    }
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    if (integer) n = Math.trunc(n);
    setText(format(n, decimals));
    if (n !== value) onChange(n);
  };

  return (
    <input
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step ?? (integer ? 1 : "any")}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      autoFocus={autoFocus}
      onFocus={(e) => {
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        commit(e.currentTarget.value);
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(format(value, decimals));
          onEscape?.();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}
