import { AnimatedOutlet } from './AnimatedOutlet'
import { AuroraSky } from './AuroraSky'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

export function AppShell() {
  return (
    <div className="relative min-h-screen">
      <AuroraSky />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="relative mx-auto w-full max-w-7xl flex-none px-3 pb-4 pt-6 sm:px-5 sm:pb-5 sm:pt-8">
          <AnimatedOutlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
