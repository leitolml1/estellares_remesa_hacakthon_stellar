import { useLocation, useOutlet } from 'react-router-dom'

export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()

  return (
    <div className="relative">
      <div key={location.pathname}>
        <span className="page-sweep" aria-hidden="true" />
        <div className="page-view">{outlet}</div>
      </div>
    </div>
  )
}
