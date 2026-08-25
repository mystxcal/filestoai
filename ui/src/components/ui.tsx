// The small controls, built once so the whole interface presses, focuses and
// animates the same way.

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import * as Icon from "./icons";

const SPRING = { type: "spring", stiffness: 700, damping: 46, mass: 0.5 } as const;
const STILL = { duration: 0 } as const;

export function useTransition() {
  return useReducedMotion() ? STILL : SPRING;
}

// ── checkbox ────────────────────────────────────────────────────────────────

export type CheckState = "on" | "off" | "some";

/**
 * Three states, one box. A folder that is partly selected says so rather than
 * rounding itself to the nearest lie.
 */
export function Check({
  state,
  onChange,
  label,
}: {
  state: CheckState;
  onChange: () => void;
  label: string;
}) {
  const transition = useTransition();
  const filled = state !== "off";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "some" ? "mixed" : state === "on"}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className="grid size-[15px] shrink-0 place-items-center rounded-[4.5px] outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      style={{
        background: filled ? "var(--accent)" : "var(--well)",
        boxShadow: filled
          ? "none"
          : "inset 0 0 0 1px var(--hairline-strong), inset 0 1px 2px rgba(0,0,0,.05)",
      }}
    >
      <motion.span
        initial={false}
        animate={{ scale: filled ? 1 : 0.4, opacity: filled ? 1 : 0 }}
        transition={transition}
        className="grid place-items-center text-white dark:text-[#141312]"
      >
        {state === "some" ? (
          <Icon.Dash className="size-[13px]" />
        ) : (
          <Icon.Tick className="size-[11px]" />
        )}
      </motion.span>
    </button>
  );
}

// ── switch ──────────────────────────────────────────────────────────────────

export function Switch({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
}) {
  const transition = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex w-full items-center gap-2.5 rounded-[7px] py-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      <span
        className="relative h-[17px] w-[28px] shrink-0 rounded-full transition-colors duration-200"
        style={{
          background: on ? "var(--accent)" : "var(--well)",
          boxShadow: on ? "none" : "inset 0 0 0 1px var(--hairline-strong)",
        }}
      >
        <motion.span
          initial={false}
          animate={{ x: on ? 12 : 1.5 }}
          transition={transition}
          className="absolute top-[1.5px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.3)]"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-ink-2 group-hover:text-ink">
          {label}
        </span>
        {hint ? <span className="block text-[11px] text-ink-3">{hint}</span> : null}
      </span>
    </button>
  );
}

// ── buttons ─────────────────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  tone = "quiet",
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "quiet";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const primary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`press inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
        primary
          ? "text-white dark:text-[#141312]"
          : "mat-cap text-ink-2 hover:text-ink"
      } ${className}`}
      style={primary ? { background: "var(--accent)" } : undefined}
    >
      {children}
    </button>
  );
}

/** A square button that is only an icon. */
export function IconButton({
  children,
  onClick,
  label,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`press grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 outline-none hover:bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${className}`}
    >
      {children}
    </button>
  );
}

// ── segmented control ───────────────────────────────────────────────────────

/**
 * The selected segment is one element that slides, not three that fade, so the
 * eye tracks a single object across the track instead of losing it.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const transition = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mat-well inline-flex h-8 items-center gap-0.5 rounded-[9px] p-[3px]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="relative rounded-[6.5px] px-2.5 py-1 text-[12px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
          >
            {active ? (
              <motion.span
                layoutId={`segment-${label}`}
                transition={transition}
                className="mat-panel absolute inset-0 rounded-[6.5px]"
              />
            ) : null}
            <span
              className={`relative ${active ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── chip ────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  meta,
  state,
  onClick,
}: {
  label: string;
  meta: string;
  state: CheckState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state === "on"}
      className="press inline-flex h-[25px] items-center gap-1.5 rounded-[7px] px-2 text-[11.5px] outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
      style={{
        background: state === "off" ? "var(--well)" : "var(--accent-soft)",
        boxShadow:
          state === "off"
            ? "inset 0 0 0 1px var(--hairline)"
            : "inset 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent)",
        color: state === "off" ? "var(--ink-2)" : "var(--accent)",
      }}
    >
      <span className="font-mono">{label}</span>
      <span className="meta opacity-60">{meta}</span>
      {state === "some" ? <Icon.Dash className="size-3 opacity-60" /> : null}
    </button>
  );
}

// ── field ───────────────────────────────────────────────────────────────────

export function Field({
  value,
  onChange,
  placeholder,
  onEnter,
  mono,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  mono?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <input
      value={value}
      aria-label={ariaLabel}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) onEnter();
      }}
      className={`mat-well h-8 min-w-0 rounded-[8px] px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ghost focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ${
        mono ? "font-mono text-[12px]" : ""
      } ${className}`}
    />
  );
}

// ── section heading ─────────────────────────────────────────────────────────

export function Legend({ children }: { children: ReactNode }) {
  return <div className="meta mb-2 text-ink-3 uppercase">{children}</div>;
}
