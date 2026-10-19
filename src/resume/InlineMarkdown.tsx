import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

const safeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const parsed = new URL(trimmed, "https://example.invalid");
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const components: Components = {
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  b: ({ children }) => <strong>{children}</strong>,
  i: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del>{children}</del>,
  code: ({ children }) => <code className="r-code">{children}</code>,
  a: ({ children, href }) => {
    const safe = safeUrl(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  img: ({ alt }) => (
    <span className="r-img-alt">{alt ? `[图片：${alt}]` : "[图片]"}</span>
  ),
  h1: ({ children }) => <strong>{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>,
  h6: ({ children }) => <strong>{children}</strong>,
  br: () => <br />,
  hr: () => null,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => <>{children}</>,
};

interface InlineMarkdownProps {
  text: string;
  className?: string;
}

/**
 * 只渲染行内 Markdown。原始 HTML 被禁用，链接协议受白名单限制。
 * 组件被 memo 化，避免每次输入时重复解析未变化的行。
 */
export const InlineMarkdown = memo(function InlineMarkdown({
  text,
  className,
}: InlineMarkdownProps) {
  return (
    <span className={className}>
      <ReactMarkdown
        allowedElements={[
          "p",
          "strong",
          "em",
          "b",
          "i",
          "del",
          "code",
          "a",
          "br",
          "span",
          "img",
        ]}
        components={components}
        skipHtml
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </span>
  );
});
