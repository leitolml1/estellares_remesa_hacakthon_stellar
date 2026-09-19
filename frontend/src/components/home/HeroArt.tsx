export function HeroArt() {
  return (
    <div className="relative mx-auto flex min-h-[280px] w-full max-w-[440px] items-center justify-center sm:min-h-[360px]">
      <span className="anim-doodle pointer-events-none absolute left-6 top-8 text-white/35">+</span>
      <span className="pointer-events-none absolute right-4 top-12 h-24 w-24 rounded-full border border-white/12" />
      <span className="doodle-grid pointer-events-none absolute bottom-4 right-2 h-20 w-20 opacity-40" />
      <img
        src="/brand/estelares-logo.png"
        alt="Estelares. Remesas sin fronteras"
        className="relative z-10 w-[90%] max-w-[380px] object-contain"
      />
    </div>
  )
}
