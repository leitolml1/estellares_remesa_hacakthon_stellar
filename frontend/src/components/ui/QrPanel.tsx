import { QRCodeSVG } from 'qrcode.react'

export function QrPanel({
  value,
  caption,
  size = 220,
  framed = true,
}: {
  value: string
  caption?: string
  size?: number
  framed?: boolean
}) {
  const code = (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#ffffff"
      fgColor="#0a0a0a"
      level="M"
    />
  )
  return (
    <div className="flex flex-col items-center gap-4">
      {framed ? <div className="rounded-[28px] bg-white p-5">{code}</div> : code}
      {caption ? (
        <p className="max-w-xs text-center text-sm leading-6 opacity-70">
          {caption}
        </p>
      ) : null}
    </div>
  )
}
