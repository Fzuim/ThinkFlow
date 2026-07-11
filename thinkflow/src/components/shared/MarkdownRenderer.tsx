import { memo, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 可复用的 Markdown 渲染组件。
 * 支持 GitHub 风格 Markdown（GFM）：标题、列表、表格、删除线、任务列表等。
 * 样式匹配 ThinkFlow 暖色调主题。
 */
function MarkdownRendererImpl({ content, className, style }: MarkdownRendererProps) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-lg font-bold mt-5 mb-3" style={{ color: "#794f27" }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-base font-bold mt-5 mb-2" style={{ color: "#794f27" }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-semibold mt-4 mb-2" style={{ color: "#19c8b9" }}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-sm font-semibold mt-3 mb-1" style={{ color: "#725d42" }}>
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="text-xs font-semibold mt-3 mb-1" style={{ color: "#725d42" }}>
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="text-xs font-medium mt-3 mb-1" style={{ color: "#9f927d" }}>
        {children}
      </h6>
    ),
    p: ({ children }) => (
      <p className="text-sm leading-relaxed my-1.5" style={{ color: "#725d42" }}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="text-sm leading-relaxed my-2 pl-5 list-disc space-y-1" style={{ color: "#725d42" }}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="text-sm leading-relaxed my-2 pl-5 list-decimal space-y-1" style={{ color: "#725d42" }}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li>{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold" style={{ color: "#794f27" }}>
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em style={{ color: "#9f927d" }}>{children}</em>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className="my-2 pl-4 py-1 text-sm italic"
        style={{
          color: "#9f927d",
          borderLeft: "3px solid #c4b89e",
        }}
      >
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-4" style={{ borderColor: "#c4b89e", opacity: 0.5 }} />
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: "#19c8b9" }}
      >
        {children}
      </a>
    ),
    code: ({ className: codeClassName, children }) => {
      const isInline = !codeClassName;
      if (isInline) {
        return (
          <code
            className="px-1.5 py-0.5 rounded text-xs"
            style={{
              background: "rgba(121,79,39,0.1)",
              color: "#794f27",
              fontFamily: "monospace",
            }}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={codeClassName} style={{ fontFamily: "monospace" }}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre
        className="my-3 p-3 rounded-lg overflow-x-auto text-xs"
        style={{
          background: "rgba(121,79,39,0.08)",
          border: "1px solid rgba(196,184,158,0.3)",
        }}
      >
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <table
        className="my-3 w-full text-sm border-collapse"
        style={{ color: "#725d42" }}
      >
        {children}
      </table>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr style={{ borderBottom: "1px solid rgba(196,184,158,0.4)" }}>
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th
        className="px-3 py-2 text-left font-semibold"
        style={{ color: "#794f27" }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2">{children}</td>
    ),
    // GFM task list items
    input: ({ checked }) => (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mr-2 align-middle"
        style={{ accentColor: "#19c8b9" }}
      />
    ),
  };

  return (
    <div className={className} style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererImpl);
