import { useEffect, useState } from 'react'
import { useReducedMotion } from './lib/useReducedMotion'
import { initSmoothScroll } from './lib/smoothScroll'
import CornerTicks from './components/CornerTicks'
import LoadingScreen from './components/LoadingScreen'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import SelectedStructures from './components/SelectedStructures'
import Capabilities from './components/Capabilities'
import Log from './components/Log'
import Explorations from './components/Explorations'
import ContactFooter from './components/ContactFooter'

export default function App() {
  const reduced = useReducedMotion()
  const [isLoading, setIsLoading] = useState(!reduced)

  useEffect(() => initSmoothScroll(reduced), [reduced])

  return (
    <>
      {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}
      <CornerTicks />
      <Navbar />
      <main>
        <Hero />
        <SelectedStructures />
        <Capabilities />
        <Log />
        <Explorations />
      </main>
      <ContactFooter />
    </>
  )
}
