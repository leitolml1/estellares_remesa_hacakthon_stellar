export function HeroArt() {
  return (
    <div className="relative mx-auto h-[320px] w-full max-w-[420px] sm:h-[380px]">
      <span className="absolute left-6 top-4 h-24 w-24 rounded-full border-[3px] border-purple border-r-transparent" />
      <span className="absolute left-[5.5rem] top-3 h-2.5 w-2.5 rounded-full bg-white" />

      <span className="floaty absolute right-8 top-2 grid h-12 w-14 place-items-center rounded-2xl bg-white">
        <Spark />
      </span>
      <span className="absolute right-2 top-20 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-ink">
        XLM
      </span>
      <span className="absolute right-6 top-36 text-lg text-white/70">+</span>
      <span className="absolute left-4 top-40 text-yellow">✳</span>
      <span className="absolute bottom-28 left-3 h-0 w-0 border-x-[8px] border-b-[14px] border-x-transparent border-b-yellow" />

      <div className="absolute left-12 top-10 h-[210px] w-[230px] rounded-[28px] bg-purple p-4 sm:left-16 sm:top-12 sm:h-[240px] sm:w-[260px] sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-yellow sm:h-14 sm:w-14">
            <span className="text-xl text-ink">★</span>
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-2 rounded-full bg-white" />
            <div className="h-2 w-2/3 rounded-full bg-white/40" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className={`h-7 rounded-md sm:h-8 ${index % 3 === 0 ? 'bg-yellow' : 'bg-white'}`}
            />
          ))}
        </div>
      </div>

      <div className="floaty absolute left-2 top-40">
        <div className="relative h-20 w-32">
          <div className="absolute left-10 top-0 h-7 w-2.5 rounded-full bg-yellow" />
          <div className="absolute left-14 top-1 h-8 w-2.5 rounded-full bg-yellow" />
          <div className="absolute left-[4.5rem] top-3 h-7 w-2.5 rounded-full bg-yellow" />
          <div className="absolute bottom-1 left-8 h-12 w-20 rounded-[22px] bg-yellow" />
          <div className="absolute bottom-5 right-0 h-3 w-10 rounded-full bg-white" />
        </div>
      </div>

      <div className="floaty floaty-delay absolute right-0 top-28">
        <div className="relative h-16 w-28">
          <div className="absolute right-2 top-4 h-11 w-16 rounded-[20px] bg-white" />
          <div className="absolute left-4 top-6 h-3 w-12 rounded-full bg-white" />
          <div className="absolute left-0 top-4 h-3 w-10 rounded-full bg-yellow" />
        </div>
      </div>

      <span className="absolute bottom-10 left-10 text-3xl font-black tracking-[0.25em] text-white">
        SEP-7
      </span>
      <span className="doodle-grid absolute bottom-2 right-2 h-24 w-24" />
      <span className="absolute bottom-32 right-10 h-3 w-3 rotate-45 bg-yellow" />
      <span className="absolute bottom-16 right-28 h-7 w-7 rounded-full border-[3px] border-white" />
    </div>
  )
}

function Spark() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10 1 12 8h7l-5.5 4 2 7L10 15l-5.5 4 2-7L1 8h7L10 1Z"
        fill="#0A0A0A"
      />
    </svg>
  )
}
