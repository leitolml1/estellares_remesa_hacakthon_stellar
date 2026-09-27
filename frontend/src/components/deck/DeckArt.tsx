import type { ReactElement } from 'react'

const ink = '#0a0a0a'
const yellow = '#f5d000'
const purple = '#6d4aff'
const deep = '#4b2ad6'
const paper = '#fffdf8'
const lilac = '#efe6ff'

export type DeckArtName =
  | 'delay'
  | 'people'
  | 'scope'
  | 'remesa'
  | 'boxes'
  | 'yield'
  | 'open'
  | 'rank'
  | 'crowd'
  | 'deposit'
  | 'anywhere'
  | 'roles'
  | 'blendIn'
  | 'blendRead'
  | 'blendLimit'

export function DeckArt({ name }: { name: DeckArtName }) {
  const Scene = SCENES[name]
  return (
    <div className="deck-art" aria-hidden="true">
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="200" fill={paper} />
        <circle cx="292" cy="8" r="78" fill={lilac} />
        <circle cx="18" cy="196" r="64" fill={yellow} opacity="0.35" />
        <Scene />
      </svg>
    </div>
  )
}

const SCENES: Record<DeckArtName, () => ReactElement> = {
  delay: Delay,
  people: People,
  scope: Scope,
  remesa: Remesa,
  boxes: Boxes,
  yield: Yield,
  open: Open,
  rank: Rank,
  crowd: Crowd,
  deposit: Deposit,
  anywhere: Anywhere,
  roles: Roles,
  blendIn: BlendIn,
  blendRead: BlendRead,
  blendLimit: BlendLimit,
}

function Delay() {
  return (
    <>
      <Bubble x={18} y={36} w={118} h={52} />
      <circle cx={48} cy={62} r={5} fill={purple} />
      <circle cx={68} cy={62} r={5} fill={purple} opacity="0.55" />
      <circle cx={88} cy={62} r={5} fill={purple} opacity="0.28" />
      <path
        d="M28 118h70"
        stroke={yellow}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      <circle cx="160" cy="118" r="22" fill={ink} />
      <circle cx="160" cy="118" r="14" fill="none" stroke={yellow} strokeWidth="3" />
      <path d="M160 110v9l6 4" stroke={yellow} strokeWidth="2.4" strokeLinecap="round" />
      <Bubble x={184} y={112} w={112} h={48} />
      <path d="M206 136h68" stroke={lilac} strokeWidth="8" strokeLinecap="round" />
    </>
  )
}

function People() {
  return (
    <>
      <path d="M48 118h224" stroke={yellow} strokeWidth="6" strokeLinecap="round" />
      <Person x={48} y={78} />
      <g transform="translate(148 78)">
        <Person x={-28} y={0} scale={0.82} />
        <Person x={8} y={6} scale={0.82} />
        <Person x={40} y={0} scale={0.82} />
      </g>
      <House x={250} y={70} />
    </>
  )
}

function Scope() {
  return (
    <>
      <Tile x={22} y={48} glyph="send" />
      <Tile x={96} y={48} glyph="link" />
      <Tile x={170} y={48} glyph="vault" />
      <Tile x={244} y={48} glyph="bolt" />
    </>
  )
}

function Remesa() {
  return (
    <>
      <Phone x={28} y={22} />
      <circle cx="168" cy="100" r="26" fill={yellow} />
      <path
        d="M156 100h22M170 90l10 10-10 10"
        stroke={ink}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Coin cx={236} cy={52} fill={ink} mark="star" />
      <Coin cx={268} cy={100} fill="#165a9e" mark="dollar" />
      <Coin cx={236} cy={148} fill="#2a4cb0" mark="euro" />
    </>
  )
}

function Boxes() {
  return (
    <>
      <rect x="22" y="36" width="128" height="128" rx="22" fill={lilac} />
      <circle cx="86" cy="88" r="22" fill={yellow} />
      <path d="M76 88h18M86 78v20" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="52" cy="132" r="7" fill={purple} />
      <circle cx="74" cy="132" r="7" fill={purple} />
      <circle cx="96" cy="132" r="7" fill={deep} />
      <rect x="170" y="36" width="128" height="128" rx="22" fill={ink} />
      <path d="M198 118V78l36-22 36 22v40" fill="none" stroke={yellow} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M222 118v-18h24v18" fill="none" stroke={yellow} strokeWidth="3.5" />
    </>
  )
}

function Yield() {
  return (
    <>
      <path d="M36 150h248" stroke="#e4dcf8" strokeWidth="2" />
      <path d="M36 118h248" stroke="#e4dcf8" strokeWidth="2" />
      <path d="M36 86h248" stroke="#e4dcf8" strokeWidth="2" />
      <path
        d="M40 132 C90 132 110 70 160 78 C210 86 230 40 286 34"
        fill="none"
        stroke={yellow}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M40 148h246"
        fill="none"
        stroke="#0c7f8c"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="286" cy="34" r="16" fill={ink} />
      <path d="M286 26v10M281 31h10" stroke={yellow} strokeWidth="2.4" strokeLinecap="round" />
    </>
  )
}

function Open() {
  return (
    <>
      <Qr x={36} y={28} />
      <rect x="168" y="46" width="124" height="36" rx="18" fill={ink} />
      <circle cx="190" cy="64" r="6" fill={yellow} />
      <path d="M206 64h64" stroke={yellow} strokeWidth="6" strokeLinecap="round" />
      <rect x="168" y="108" width="124" height="52" rx="18" fill={lilac} />
      <circle cx="230" cy="134" r="16" fill={yellow} />
      <path d="M230 126v16M222 134h16" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    </>
  )
}

function Rank() {
  return (
    <>
      <Bar x={48} h={64} fill={purple} />
      <Bar x={128} h={96} fill={deep} />
      <Bar x={208} h={132} fill={yellow} />
      <circle cx="248" cy="42" r="14" fill={ink} />
      <path d="M248 36v8M244 40h8" stroke={yellow} strokeWidth="2.2" strokeLinecap="round" />
    </>
  )
}

function Crowd() {
  return (
    <>
      <circle cx="160" cy="100" r="34" fill={yellow} />
      <path d="M148 100h22M162 88l12 12-12 12" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Person x={46} y={48} scale={0.7} />
      <Person x={250} y={46} scale={0.7} />
      <Person x={36} y={130} scale={0.7} />
      <Person x={262} y={128} scale={0.7} />
    </>
  )
}

function Deposit() {
  return (
    <>
      <rect x="78" y="108" width="164" height="62" rx="18" fill={ink} />
      <path d="M108 108v-16c0-18 104-18 104 0v16" fill="none" stroke={yellow} strokeWidth="4" />
      <Coin cx={70} cy={48} fill={ink} mark="star" small />
      <Coin cx={160} cy={36} fill="#165a9e" mark="dollar" small />
      <Coin cx={250} cy={48} fill="#2a4cb0" mark="euro" small />
      <path d="M78 72c8 18 18 28 36 36" stroke={purple} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M160 64v36" stroke={purple} strokeWidth="3" strokeLinecap="round" />
      <path d="M242 72c-8 18-18 28-36 36" stroke={purple} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  )
}

function Anywhere() {
  return (
    <>
      <circle cx="112" cy="100" r="54" fill={lilac} />
      <circle cx="112" cy="100" r="54" fill="none" stroke={deep} strokeWidth="3" />
      <ellipse cx="112" cy="100" rx="22" ry="54" fill="none" stroke={purple} strokeWidth="2.5" />
      <path d="M58 100h108" stroke={purple} strokeWidth="2.5" />
      <path d="M70 76c28 12 56 12 84 0" fill="none" stroke={purple} strokeWidth="2.5" />
      <path d="M70 124c28-12 56-12 84 0" fill="none" stroke={purple} strokeWidth="2.5" />
      <circle cx="236" cy="100" r="28" fill={yellow} />
      <path
        d="M222 100h26M238 88l14 12-14 12"
        stroke={ink}
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

function Roles() {
  return (
    <>
      <rect x="28" y="40" width="150" height="120" rx="20" fill={ink} />
      <circle cx="70" cy="86" r="16" fill={yellow} />
      <path d="M104 78h48M104 96h32" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
      <rect x="196" y="48" width="96" height="28" rx="14" fill={yellow} />
      <path d="M214 62h60" stroke={ink} strokeWidth="5" strokeLinecap="round" />
      <rect x="196" y="96" width="96" height="52" rx="16" fill={lilac} />
      <rect x="210" y="116" width="68" height="10" rx="5" fill="#fff" />
      <rect x="210" y="116" width="40" height="10" rx="5" fill={purple} />
    </>
  )
}

function BlendIn() {
  return (
    <>
      <Coin cx={72} cy={100} fill={ink} mark="star" />
      <path d="M112 100h48" stroke={yellow} strokeWidth="8" strokeLinecap="round" />
      <path d="M148 88l16 12-16 12" stroke={yellow} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="186" y="46" width="100" height="108" rx="22" fill={deep} />
      <path d="M210 112V78l26-16 26 16v34" fill="none" stroke={yellow} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="236" cy="96" r="8" fill={yellow} />
    </>
  )
}

function BlendRead() {
  return (
    <>
      <rect x="28" y="28" width="264" height="144" rx="20" fill={lilac} />
      <path d="M52 132h216" stroke="#fff" strokeWidth="2" />
      <path
        d="M52 120 C100 120 120 70 168 74 C214 78 230 48 268 42"
        fill="none"
        stroke="#a67c00"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M52 128h216" stroke="#0c7f8c" strokeWidth="5" strokeLinecap="round" />
      <circle cx="86" cy="52" r="10" fill={yellow} />
      <circle cx="114" cy="52" r="10" fill="#fff" />
      <circle cx="142" cy="52" r="10" fill="#fff" />
    </>
  )
}

function BlendLimit() {
  return (
    <>
      <Coin cx={78} cy={78} fill="#165a9e" mark="dollar" />
      <Coin cx={150} cy={78} fill="#2a4cb0" mark="euro" />
      <path d="M58 118h112" stroke="#9d2340" strokeWidth="6" strokeLinecap="round" />
      <circle cx="248" cy="108" r="40" fill={ink} />
      <circle cx="248" cy="108" r="14" fill={yellow} />
      <path d="M248 90l6 8h-12z" fill={yellow} />
    </>
  )
}

function Bubble({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} rx="18" fill="#fff" stroke={lilac} strokeWidth="3" />
}

function Person({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="-18" r="12" fill={purple} />
      <path d="M-18 16c2-16 34-16 36 0" fill={deep} />
    </g>
  )
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 22 L28 -8 L56 22 V58 H0 Z" fill={ink} />
      <path d="M20 58 V38 H36 V58" fill={yellow} />
    </g>
  )
}

function Tile({ x, y, glyph }: { x: number; y: number; glyph: 'send' | 'link' | 'vault' | 'bolt' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="58" height="104" rx="18" fill={glyph === 'bolt' ? yellow : lilac} />
      {glyph === 'send' ? (
        <path d="M16 52h24M32 42l10 10-10 10" stroke={deep} strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : null}
      {glyph === 'link' ? (
        <>
          <circle cx="22" cy="52" r="8" fill="none" stroke={deep} strokeWidth="3" />
          <circle cx="36" cy="52" r="8" fill="none" stroke={deep} strokeWidth="3" />
        </>
      ) : null}
      {glyph === 'vault' ? (
        <path d="M14 68V40l15-10 15 10v28" fill="none" stroke={deep} strokeWidth="3" />
      ) : null}
      {glyph === 'bolt' ? (
        <path d="M32 34l-10 22h10l-4 18 16-26h-10z" fill={ink} />
      ) : null}
    </g>
  )
}

function Phone({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="92" height="156" rx="18" fill={ink} />
      <rect x="12" y="22" width="68" height="68" rx="8" fill="#fff" />
      <QrBits />
      <rect x="28" y="128" width="36" height="6" rx="3" fill={yellow} />
    </g>
  )
}

function QrBits() {
  const cells = [0, 1, 2, 4, 5, 6, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24]
  return (
    <g transform="translate(18 28)">
      {cells.map((n) => (
        <rect
          key={n}
          x={(n % 5) * 11}
          y={Math.floor(n / 5) * 11}
          width="8"
          height="8"
          rx="1.5"
          fill={ink}
        />
      ))}
    </g>
  )
}

function Qr({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="112" height="144" rx="18" fill="#fff" stroke={lilac} strokeWidth="3" />
      <Finder tx={16} ty={16} />
      <Finder tx={64} ty={16} />
      <Finder tx={16} ty={80} />
      <rect x="64" y="80" width="14" height="14" rx="2" fill={ink} />
      <rect x="82" y="80" width="14" height="14" rx="2" fill={purple} />
      <rect x="64" y="98" width="14" height="14" rx="2" fill={yellow} />
      <rect x="82" y="112" width="14" height="14" rx="2" fill={ink} />
    </g>
  )
}

function Finder({ tx, ty }: { tx: number; ty: number }) {
  return (
    <g transform={`translate(${tx} ${ty})`}>
      <rect width="32" height="32" rx="4" fill={ink} />
      <rect x="6" y="6" width="20" height="20" rx="2" fill="#fff" />
      <rect x="11" y="11" width="10" height="10" rx="1" fill={ink} />
    </g>
  )
}

function Coin({
  cx,
  cy,
  fill,
  mark,
  small,
}: {
  cx: number
  cy: number
  fill: string
  mark: 'star' | 'dollar' | 'euro'
  small?: boolean
}) {
  const r = small ? 18 : 24
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke="#fff" strokeWidth="2" opacity="0.85" />
      {mark === 'star' ? (
        <path
          d={`M${cx} ${cy - 8}l2.2 5.2 5.6.5-4.3 3.6 1.4 5.5L${cx} ${cy + 3.2}l-4.9 3.6 1.4-5.5-4.3-3.6 5.6-.5z`}
          fill={yellow}
        />
      ) : null}
      {mark === 'dollar' ? (
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize={small ? 16 : 20} fontWeight="700" fill="#fff">
          $
        </text>
      ) : null}
      {mark === 'euro' ? (
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize={small ? 16 : 20} fontWeight="700" fill="#fff">
          €
        </text>
      ) : null}
    </g>
  )
}

function Bar({ x, h, fill }: { x: number; h: number; fill: string }) {
  return (
    <g>
      <rect x={x} y={160 - h} width="48" height={h} rx="14" fill={fill} />
      <circle cx={x + 24} cy={148 - h} r="10" fill={ink} />
    </g>
  )
}
