export function StarMark({
  className = 'h-8 w-11',
  tone = 'dark',
}: {
  className?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <span
      className={`orbit-mark star-mark star-mark-${tone} inline-grid place-items-center overflow-hidden rounded-xl ${className}`}
    >
      {tone === 'light' ? (
        <span className="star-mark-glyph" aria-hidden="true" />
      ) : (
        <img
          src="/brand/estelares-mark.png"
          alt=""
          className="h-full w-full scale-[1.35] object-cover"
        />
      )}
    </span>
  )
}
