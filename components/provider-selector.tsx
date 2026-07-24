"use client";

import { ChevronDown } from "lucide-react";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/providers";

interface ProviderSelectorProps {
  provider: ProviderId;
  onChangeKey: () => void;
}

export function ProviderSelector({ provider, onChangeKey }: ProviderSelectorProps) {
  return (
    <button type="button" className="provider-chip" onClick={onChangeKey}>
      {PROVIDER_LABELS[provider]}
      <ChevronDown aria-hidden="true" />
    </button>
  );
}
