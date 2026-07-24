export function ThinkingIndicator({ statusText }: { statusText: string }) {
  return (
    <div className="msg">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative avatar crop, not worth next/image */}
      <img className="brand-mark avatar assistant thinking" src="/avatar.png" alt="" />
      <div className="thinking-bubble">
        <span className="thinking-dot" aria-hidden="true" />
        <span>{statusText}</span>
      </div>
    </div>
  );
}
