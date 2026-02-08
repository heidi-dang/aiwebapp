export default function MarkdownRenderer({ children }: { children: string }) {
  return <pre className="whitespace-pre-wrap text-sm">{children}</pre>
}