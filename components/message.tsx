import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import batch from "react-syntax-highlighter/dist/esm/languages/prism/batch";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import groovy from "react-syntax-highlighter/dist/esm/languages/prism/groovy";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { cn } from "@/lib/utils";
import { getMessageText } from "@/lib/message-text";
import type { ChatUIMessage } from "@/lib/types";

// The default `Prism` import bundles all ~300 Prism grammars; registering
// only the languages that actually appear in the ingested Playwright docs
// (verified against data/raw-docs code fences) keeps the client bundle to
// just what's used. Anything unregistered falls back to unhighlighted plain
// text rather than erroring — acceptable for the rare stray fence tag.
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("batch", batch);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("groovy", groovy);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("powershell", powershell);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

const markdownComponents: Components = {
  code(props) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className ?? "");
    const codeText = String(children).replace(/\n$/, "");

    if (!match) {
      return (
        <code
          {...rest}
          className="rounded bg-current/10 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {children}
        </code>
      );
    }

    return (
      <SyntaxHighlighter
        language={match[1]}
        style={oneDark}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: "0.5rem", fontSize: "0.875rem" }}
      >
        {codeText}
      </SyntaxHighlighter>
    );
  },
  a(props) {
    return (
      <a
        {...props}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2"
      />
    );
  },
};

interface MessageProps {
  message: ChatUIMessage;
  /** Subtle breathing animation on the avatar while this is the message
   * actively receiving streamed tokens — signals "still composing" the
   * same way the thinking indicator's avatar does before the first token
   * arrives. */
  pulseAvatar?: boolean;
}

// Past messages don't change once rendered — `message` keeps a stable
// reference and `pulseAvatar` is only ever true for the last one — so
// memoizing skips re-running ReactMarkdown/Prism for the whole history on
// every parent re-render (notably every keystroke in the prompt box, which
// otherwise got dramatically slower as the conversation grew).
export const Message = memo(function Message({ message, pulseAvatar }: MessageProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);

  return (
    <div className={cn("msg", isUser && "user")}>
      {!isUser && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny decorative avatar crop repeated per message, not worth next/image
        <img
          className={cn("brand-mark avatar assistant", pulseAvatar && "thinking")}
          src="/avatar.png"
          alt=""
        />
      )}

      <div className={cn("bubble", isUser ? "user" : "assistant")}>
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={markdownComponents}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {isUser && <span className="avatar user">You</span>}
    </div>
  );
});
