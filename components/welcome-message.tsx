/** Shown only until the first real message exists — a UI-only greeting,
 * never part of the actual `useChat` messages array, so it's never sent to
 * the API or replayed as conversation history. */
export function WelcomeMessage() {
  return (
    <div className="msg">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative avatar crop, not worth next/image */}
      <img className="brand-mark avatar assistant" src="/avatar.png" alt="" />
      <div className="bubble assistant">
        Hi! I&apos;m Korso Agent, your Playwright AI Assistant. Ask me anything
        about Playwright — locators, assertions, test config, debugging, and
        best practices.
      </div>
    </div>
  );
}
