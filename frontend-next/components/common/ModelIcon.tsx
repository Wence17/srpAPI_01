'use client'

interface ModelIconProps {
  model: string
  size?: string
}

function resolveIconKey(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('claude')) return 'claude'
  if (lower.includes('gpt') || lower.includes('codex') || lower.includes('o1') || lower.includes('o3'))
    return 'openai'
  if (lower.includes('gemini')) return 'gemini'
  return 'generic'
}

const iconColors: Record<string, string> = {
  claude: '#D97706',
  openai: '#000000',
  gemini: '#4285F4',
  generic: '#64748B',
}

export default function ModelIcon({ model, size = '18px' }: ModelIconProps) {
  const key = resolveIconKey(model)
  const color = iconColors[key] || iconColors.generic
  const letter = model.trim().charAt(0).toUpperCase() || '?'

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: `calc(${size} * 0.45)`,
        backgroundColor: `${color}22`,
        color,
      }}
      title={model}
    >
      {letter}
    </span>
  )
}
