"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowDown, Eraser, TriangleAlert } from "lucide-react";
import { Message } from "@/components/message";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { WelcomeMessage } from "@/components/welcome-message";
import { PromptBox } from "@/components/prompt-box";
import { ApiKeyModal } from "@/components/api-key-modal";
import { ConnectPanel } from "@/components/connect-panel";
import { ProviderSelector } from "@/components/provider-selector";
import { ModeToggle } from "@/components/mode-toggle";
import { BackgroundScene } from "@/components/background-scene";
import { GithubIcon, LinkedinIcon } from "@/components/icons/brand-icons";
import {
  clearCredentials,
  getCredentialsSnapshot,
  getServerCredentialsSnapshot,
  saveCredentials,
  subscribeCredentials,
  type StoredCredentials,
} from "@/lib/credentials";
import {
  getServerThemeChoiceSnapshot,
  getThemeChoiceSnapshot,
  resolveScene,
  saveThemeChoice,
  subscribeResolvedScene,
  subscribeThemeChoice,
  type ResolvedScene,
} from "@/lib/theme-mode";
import { getMessageText } from "@/lib/message-text";
import { getThinkingStatus } from "@/lib/thinking-status";
import type { ChatUIMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** True only once the client has rendered at least once past hydration.
 * Implemented via useSyncExternalStore (server snapshot `false`, client
 * snapshot `true`) instead of the usual useState+useEffect "hasMounted"
 * idiom, purely to steer clear of React's newer set-state-in-effect lint
 * rule — behaviorally this is the same one-render hydration gate.
 *
 * Gates which top-level layout (landing vs. full chat) renders: `credentials`
 * starts as the SSR-safe `null` on first paint even for a returning user
 * with a stored key, so branching on it before this settles would flash the
 * landing state before flipping to the chat state. */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function ChatWindow() {
  const credentials = useSyncExternalStore(
    subscribeCredentials,
    getCredentialsSnapshot,
    getServerCredentialsSnapshot
  );

  const themeChoice = useSyncExternalStore(
    subscribeThemeChoice,
    getThemeChoiceSnapshot,
    getServerThemeChoiceSnapshot
  );
  // Ticks on its own every minute while "system" is active (see
  // subscribeResolvedScene) so the scene flips at the day/night boundary
  // without needing a reload.
  const scene = useSyncExternalStore(
    subscribeResolvedScene,
    () => resolveScene(themeChoice),
    (): ResolvedScene => "day"
  );

  const hasMounted = useHasMounted();

  // The popup modal is now only for changing an already-saved key — the
  // first-time flow lives inline in ConnectPanel instead, so it no longer
  // auto-opens based on credentials being absent.
  const [modalOpen, setModalOpen] = useState(false);

  const [input, setInput] = useState("");

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    // useChat always reads the latest `transport` passed on each render (see
    // @ai-sdk/react's internal latestRef), so a fresh instance per render
    // closing over the current `credentials` is the correct, SDK-documented
    // way to keep per-request headers in sync — no ref required.
    headers: (): Record<string, string> =>
      credentials
        ? { "x-provider": credentials.provider, "x-provider-key": credentials.apiKey }
        : {},
  });

  const { messages, sendMessage, status, error, setMessages } = useChat<ChatUIMessage>({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const canSend = credentials !== null && !isBusy;

  // The SDK adds an empty assistant message to `messages` as soon as
  // streaming opens, before any text has actually arrived — rendering it
  // via the normal Message component would show a blank bubble sitting
  // right above the thinking indicator. `visibleMessages` drops that one
  // empty trailing placeholder so the indicator is the only thing standing
  // in for it until real text exists, at which point it's no longer empty
  // and reappears through the normal list on its own.
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasText = lastMessage?.role === "assistant" && getMessageText(lastMessage).trim() !== "";
  const hasEmptyTrailingAssistant = lastMessage?.role === "assistant" && !lastMessageHasText;
  const visibleMessages = hasEmptyTrailingAssistant ? messages.slice(0, -1) : messages;

  // Covers the whole gap from submit through the first visible character —
  // not just the SDK's "submitted" sub-phase, and not just once the empty
  // placeholder message exists (there's a brief window right after submit
  // where `messages` still only holds the user's own message). Gating on
  // "no visible assistant text yet" rather than the raw status string
  // avoids a blank gap where neither the indicator nor real text shows.
  const isThinking = isBusy && !lastMessageHasText;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const thinkingStatus = getThinkingStatus(lastUserMessage ? getMessageText(lastUserMessage) : "");

  // Sticks to the bottom while new content streams in — but only while the
  // user is already there. If they've scrolled up into history, incoming
  // tokens shouldn't yank them back down; the jump-to-latest button covers
  // that case instead. `isAtBottom` is only ever set from the scroll event
  // callback (never synchronously in an effect body) or from a direct user
  // action (send / jump-button click).
  const messagesRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Streaming re-fires the auto-scroll effect on every single token — without
  // coalescing, that's a forced synchronous reflow (el.scrollHeight) dozens
  // of times a second, right on the hot path of watching a response come
  // in. rAF caps it at once per paintable frame instead.
  const scrollRafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const scheduleScrollToBottom = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollToBottom();
    });
  }, [scrollToBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      const threshold = 80;
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
    }
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
    // `.messages` only exists in the DOM once `credentials` is non-null (the
    // landing → chat transition); an empty dep array would bind this before
    // that element ever mounts and never re-attach once it does.
  }, [credentials]);

  useEffect(() => {
    if (isAtBottom) scheduleScrollToBottom();
  }, [visibleMessages, isThinking, isAtBottom, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !canSend) return;
    sendMessage({ text: trimmed });
    setInput("");
    setIsAtBottom(true);
  }

  function handleJumpToLatest() {
    setIsAtBottom(true);
    scrollToBottom();
  }

  function handleClear() {
    setMessages([]);
  }

  function handleConnect(next: StoredCredentials) {
    saveCredentials(next);
  }

  function handleSaveCredentials(next: StoredCredentials) {
    saveCredentials(next);
    setModalOpen(false);
  }

  function handleClearKey() {
    clearCredentials();
    setModalOpen(false);
  }

  return (
    <div
      data-scene={scene}
      className={cn(
        "relative flex h-screen w-full justify-center overflow-hidden",
        // Landing/connect state can be taller than a short phone viewport;
        // letting it scroll on mobile beats silently clipping content. The
        // connected chat state keeps the hard h-screen cap untouched so the
        // composer stays pinned.
        credentials === null && "is-landing"
      )}
    >
      <BackgroundScene scene={scene} />

      <ModeToggle choice={themeChoice} onChange={saveThemeChoice} />

      <div className="coords">51.3217&deg; N, 116.1860&deg; W</div>

      <div className="site-footer">
        <p className="footer-disclaimer">
          AI can make mistakes. Verify generated code before using it in production.
        </p>
        <div className="footer-credit">
          <span>Designed & Crafted by Park Kharuehadech</span>
          <a href="https://github.com/prkharueh12" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <GithubIcon aria-hidden="true" />
          </a>
          <a
            href="https://www.linkedin.com/in/pkharueh/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <LinkedinIcon aria-hidden="true" />
          </a>
        </div>
      </div>

      {hasMounted && (
        <div className="center-stack">
          {credentials === null ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative hero mark, loaded once and not a Core Web Vitals concern here */}
              <img className="brand-mark hero-logo" src="/logoCenter.png" alt="Korso Agent" />

              <div className="hero-greeting">
                <h2>Hi, I&apos;m Korso Agent, your Playwright AI Assistant.</h2>
                <p>Ask me anything about Playwright—from locators and assertions to test configuration, debugging, and best practices.</p>
              </div>

              <ConnectPanel onConnect={handleConnect} />
            </>
          ) : (
            <main className="chat-panel chat-panel--full">
              <div className="chat-head">
                <div>
                  <h1>Korso Agent</h1>
                  <p>Grounded in the official docs</p>
                </div>
                <div className="flex items-center gap-2">
                  <ProviderSelector
                    provider={credentials.provider}
                    onChangeKey={() => setModalOpen(true)}
                  />
                  {messages.length > 0 && (
                    <button
                      type="button"
                      className="clear-chat-btn"
                      onClick={handleClear}
                      aria-label="Clear chat"
                      title="Clear chat"
                    >
                      <Eraser aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div className="messages" ref={messagesRef}>
                {messages.length === 0 && <WelcomeMessage />}
                {visibleMessages.map((message, index) => (
                  <Message
                    key={message.id}
                    message={message}
                    pulseAvatar={
                      isBusy && index === visibleMessages.length - 1 && message.role === "assistant"
                    }
                  />
                ))}
                {isThinking && <ThinkingIndicator statusText={thinkingStatus} />}
              </div>

              {!isAtBottom && messages.length > 0 && (
                <button
                  type="button"
                  className="scroll-bottom-btn"
                  onClick={handleJumpToLatest}
                  aria-label="Jump to latest message"
                  title="Jump to latest message"
                >
                  <ArrowDown aria-hidden="true" />
                </button>
              )}

              {error && (
                <div className="chat-error">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {error.message || "Something went wrong. Check your API key and try again."}
                </div>
              )}

              <PromptBox value={input} onChange={setInput} onSend={handleSend} disabled={!canSend} />
            </main>
          )}
        </div>
      )}

      {hasMounted && (
        <ApiKeyModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialCredentials={credentials}
          onSave={handleSaveCredentials}
          onClear={handleClearKey}
        />
      )}
    </div>
  );
}
