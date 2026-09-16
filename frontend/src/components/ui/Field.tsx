import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export const formControlClass = 'form-input'

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="block space-y-2.5">
      <span className="form-label">{label}</span>
      {children}
      {hint && !error ? <span className="form-hint">{hint}</span> : null}
      {error ? (
        <span className="block text-base text-purple-deep">{error}</span>
      ) : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={formControlClass} {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${formControlClass} min-h-32 resize-y`} {...props} />
}
