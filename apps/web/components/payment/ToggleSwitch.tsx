'use client'

interface ToggleSwitchProps {
  label: string
  checked: boolean
  onToggle: () => void
}

export default function ToggleSwitch({ label, checked, onToggle }: ToggleSwitchProps) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-0.5">
      <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
          checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  )
}
