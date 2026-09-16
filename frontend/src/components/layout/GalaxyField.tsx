type Tone = 'paper' | 'void'

export function GalaxyField({ tone }: { tone: Tone }) {
  return (
    <div className={`galaxy-field galaxy-${tone}`} aria-hidden="true">
      <div className="galaxy-nebula galaxy-nebula-a" />
      <div className="galaxy-nebula galaxy-nebula-b" />
      <div className="galaxy-nebula galaxy-nebula-c" />
      <div className="galaxy-dust" />
    </div>
  )
}
