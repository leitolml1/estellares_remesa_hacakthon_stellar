export function Progress({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value))
  return (
    <div className="h-3.5 overflow-hidden rounded-full bg-purple-soft">
      <div
        className="h-full rounded-full bg-linear-to-r from-purple to-yellow transition-[width]"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
