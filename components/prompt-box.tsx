"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface PromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function PromptBox({ value, onChange, onSend, disabled }: PromptBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: collapse to content height then re-measure, so it expands
  // while typing and collapses back to one line once cleared (including
  // the reset to "" after send). A DOM measurement synced imperatively via
  // ref, not React state — exactly what an effect is for.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  }

  return (
    <div className="prompt-bar">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about Playwright locators, assertions, config…"
        disabled={disabled}
        rows={1}
      />
      <button
        type="button"
        className="send-btn"
        disabled={disabled || !value.trim()}
        onClick={onSend}
        aria-label="Send message"
      >
        <ArrowUp aria-hidden="true" />
      </button>
    </div>
  );
}
