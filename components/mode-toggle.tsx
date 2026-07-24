"use client";

import { Sun, Moon, Clock } from "lucide-react";
import type { ThemeChoice } from "@/lib/theme-mode";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "day", label: "Light mode", icon: Sun },
  { value: "night", label: "Dark mode", icon: Moon },
  { value: "system", label: "System theme", icon: Clock },
];

interface ModeToggleProps {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}

export function ModeToggle({ choice, onChange }: ModeToggleProps) {
  return (
    <div className="instrument" role="group" aria-label="Background mode">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
