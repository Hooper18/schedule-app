interface Props<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

export default function FilterBar<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 border-b border-border bg-main sticky top-14 z-10">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
            value === opt.value
              ? 'bg-accent text-white border-accent'
              : 'bg-card text-dim border-border hover:bg-hover'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
