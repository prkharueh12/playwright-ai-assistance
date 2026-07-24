"use client";

import { useRef, useState } from "react";
import { CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVIDER_LABELS, SUPPORTED_PROVIDERS, type ProviderId } from "@/lib/providers";
import type { StoredCredentials } from "@/lib/credentials";
import { useKeyValidation } from "@/lib/use-key-validation";

const API_KEY_PLACEHOLDERS: Record<ProviderId, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "AIza...",
};

interface ApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCredentials: StoredCredentials | null;
  onSave: (credentials: StoredCredentials) => void;
  onClear: () => void;
}

export function ApiKeyModal({
  open,
  onOpenChange,
  initialCredentials,
  onSave,
  onClear,
}: ApiKeyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect your AI model</DialogTitle>
          <DialogDescription>
            Use your own API key to power Korso Agent. Your API key is stored
            locally in your browser and is only sent to your selected provider.
          </DialogDescription>
        </DialogHeader>

        {/* Conditionally mounted: a fresh instance (and fresh local state
            seeded from the latest initialCredentials) every time the dialog
            opens, with no effect required to "reset" stale form state. */}
        {/* onSave alone drives the parent's credentials + open state — no
            separate onOpenChange(false) here, which would otherwise fire
            with a stale pre-save `credentials` closure in the parent. */}
        {open && (
          <CredentialsForm
            initialCredentials={initialCredentials}
            onSave={onSave}
            onClear={onClear}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CredentialsForm({
  initialCredentials,
  onSave,
  onClear,
}: {
  initialCredentials: StoredCredentials | null;
  onSave: (credentials: StoredCredentials) => void;
  onClear: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(
    initialCredentials?.provider ?? SUPPORTED_PROVIDERS[0]
  );
  // Keyed by provider rather than a single string, so switching providers
  // shows that provider's own last-typed key (blank if none yet) instead
  // of carrying over — or losing — whatever was typed for a different one.
  // In-memory only for the life of this open form; nothing here is
  // persisted until Save is actually clicked.
  const [keysByProvider, setKeysByProvider] = useState<Partial<Record<ProviderId, string>>>(() =>
    initialCredentials ? { [initialCredentials.provider]: initialCredentials.apiKey } : {}
  );
  const apiKey = keysByProvider[provider] ?? "";
  function setApiKey(value: string) {
    setKeysByProvider((prev) => ({ ...prev, [provider]: value }));
  }
  const validation = useKeyValidation(provider, apiKey);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    onSave({ provider, apiKey: trimmed });
  }

  function handleClearInvalidKey() {
    setApiKey("");
    inputRef.current?.focus();
  }

  function handleClear() {
    onClear();
    setProvider(SUPPORTED_PROVIDERS[0]);
    setKeysByProvider({});
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="provider-select">
            Provider
          </label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as ProviderId)}
          >
            <SelectTrigger id="provider-select" className="w-full">
              {/* Base UI's Select.Value shows the raw value unless mapped —
                  without this render-prop it displays "openai" instead of
                  "OpenAI". */}
              <SelectValue placeholder="Select a provider">
                {(value: ProviderId) => PROVIDER_LABELS[value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_PROVIDERS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="api-key-input">
            API key
          </label>
          <div className="relative">
            <Input
              ref={inputRef}
              id="api-key-input"
              type="password"
              autoComplete="off"
              placeholder={API_KEY_PLACEHOLDERS[provider]}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSave();
              }}
              aria-invalid={validation.status === "invalid"}
              className="pr-9"
            />
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              {validation.status === "checking" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {validation.status === "valid" && (
                <CircleCheck className="size-4 text-green-600 dark:text-green-500" />
              )}
              {validation.status === "invalid" && (
                <button
                  type="button"
                  onClick={handleClearInvalidKey}
                  aria-label="Clear invalid API key"
                  className="pointer-events-auto inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-destructive hover:opacity-75"
                >
                  <CircleX className="size-4" />
                </button>
              )}
              {validation.status === "unverified" && (
                <TriangleAlert className="size-4 text-amber-500" />
              )}
            </div>
          </div>
          {validation.status === "invalid" && (
            <p className="text-xs text-destructive">Invalid api key!</p>
          )}
          {validation.status === "unverified" && (
            <p className="text-xs text-amber-600">
              Couldn&apos;t verify this key right now — you can still save it.
            </p>
          )}
        </div>
      </div>

      <DialogFooter className={initialCredentials ? "sm:justify-between" : undefined}>
        {initialCredentials && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="text-muted-foreground"
          >
            Clear key
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={
            !apiKey.trim() ||
            validation.status === "invalid" ||
            validation.status === "checking"
          }
        >
          Save and continue
        </Button>
      </DialogFooter>
    </>
  );
}
