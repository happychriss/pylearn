import { useParams } from "wouter";
import { useGetCheatSheet } from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import { Info } from "lucide-react";

export default function CheatSheetView() {
  const { id } = useParams<{ id: string }>();
  const { data: sheet, isLoading, isError } = useGetCheatSheet(parseInt(id ?? "0"));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isError || !sheet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-destructive">Cheat sheet not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center gap-3 shadow-sm">
        <Info className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-lg font-semibold font-display">{sheet.title}</h1>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-2 text-primary">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-1">{children}</h3>,
            p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="ml-2">{children}</li>,
            code: ({ children, className }) => {
              const isBlock = className?.startsWith("language-");
              return isBlock
                ? <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono my-3"><code>{children}</code></pre>
                : <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm">{children}</code>;
            },
            blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-3">{children}</blockquote>,
            hr: () => <hr className="border-border my-6" />,
            table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-sm">{children}</table></div>,
            th: ({ children }) => <th className="border border-border px-3 py-2 bg-muted text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
          }}
        >
          {sheet.content}
        </ReactMarkdown>
      </main>
    </div>
  );
}
