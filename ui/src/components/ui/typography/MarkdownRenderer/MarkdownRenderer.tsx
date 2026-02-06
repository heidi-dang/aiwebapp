'use client'

import { type FC } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

import { type MarkdownRendererProps } from './types'
import { inlineComponents } from './inlineStyles'
import { components } from './styles'

const TOOL_LABEL_MAP: Record<string, string> = {
  planning: 'Planning',
  code_generation: 'Code generation',
  code_execution: 'Code execution',
  review: 'Review',
  iterate: 'Iterate',
  finish: 'Finish',
  'code generation': 'Code generation',
  'code execution': 'Code execution'
}

function replaceToolLabelsOutsideCode(content: string) {
  if (!content) return content

  // Split out code blocks (fenced and inline) so we don't replace inside them
  const codeSplitRe = /(```[\s\S]*?```|`[^`]*`)/g
  const parts = content.split(codeSplitRe)

  const wordRe = new RegExp(
    `\\b(${Object.keys(TOOL_LABEL_MAP)
      .map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|')})\\b`,
    'gi'
  )

  const replaceFn = (s: string) =>
    s.replace(wordRe, (match) => {
      // preserve original case where possible
      const key = match.toLowerCase()
      return TOOL_LABEL_MAP[key] ?? match
    })

  return parts
    .map((part) => (part && part.startsWith('`') ? part : replaceFn(part)))
    .join('')
}

const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  children,
  classname,
  inline = false
}) => {
  const content =
    typeof children === 'string'
      ? replaceToolLabelsOutsideCode(children)
      : children

  return (
    <ReactMarkdown
      className={cn(
        'prose prose-h1:text-xl dark:prose-invert flex w-full flex-col gap-y-5 rounded-lg',
        classname
      )}
      components={{ ...(inline ? inlineComponents : components) }}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
    >
      {String(content)}
    </ReactMarkdown>
  )
}

export default MarkdownRenderer
