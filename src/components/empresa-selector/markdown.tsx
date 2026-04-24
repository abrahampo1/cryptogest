import { JSX } from "react"

export function formatInlineMarkdown(text: string) {
  const parts: (string | JSX.Element)[] = []
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1]) {
      parts.push(
        <strong key={match.index} className="text-foreground font-medium">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      parts.push(
        <code key={match.index} className="bg-surface-3 text-foreground px-1 rounded text-[11px] font-mono">
          {match[4]}
        </code>
      )
    } else if (match[5]) {
      parts.push(
        <a
          key={match.index}
          className="text-primary hover:underline"
          href={match[7]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[6]}
        </a>
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function renderReleaseBody(body: string) {
  return body.split('\n').map((line, li) => {
    if (!line.trim()) return null
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      return (
        <p key={li} className="text-[13px] font-medium text-foreground mt-2">
          {formatInlineMarkdown(headerMatch[2])}
        </p>
      )
    }
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/)
    if (bulletMatch) {
      return (
        <p key={li} className="flex gap-1.5 pl-1 text-[13px] text-muted-foreground">
          <span className="text-muted-foreground/60 shrink-0">&#8226;</span>
          <span>{formatInlineMarkdown(bulletMatch[1])}</span>
        </p>
      )
    }
    return <p key={li} className="text-[13px] text-muted-foreground">{formatInlineMarkdown(line)}</p>
  })
}
