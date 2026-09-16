export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-base text-purple-deep/75">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/15 border-t-yellow" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}
