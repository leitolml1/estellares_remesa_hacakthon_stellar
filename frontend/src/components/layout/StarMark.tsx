export function StarMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <span className={`orbit-mark inline-grid place-items-center ${className}`}>
      <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true" fill="none">
        <circle cx="16" cy="16" r="15" fill="#F5D000" />
        <path
          d="M16 7.2 18.1 13h6.2l-5 3.7 1.9 6.1L16 19.2 10.8 22.8l1.9-6.1-5-3.7H14L16 7.2Z"
          fill="#0A0A0A"
        />
      </svg>
    </span>
  )
}
