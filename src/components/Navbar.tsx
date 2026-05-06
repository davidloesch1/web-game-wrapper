import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/versions', label: 'Versions' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="inline-block h-7 w-7 rounded-md bg-cyan-500" />
          <span>Self-Evolving Game</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden gap-6 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-sm font-medium transition-colors hover:text-cyan-400 ${
                pathname === l.to ? 'text-cyan-400' : 'text-gray-400'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex flex-col gap-1 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-5 bg-gray-300 transition-transform ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
          <span className={`block h-0.5 w-5 bg-gray-300 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-5 bg-gray-300 transition-transform ${menuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-800 px-4 pb-4 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className={`block py-2 text-sm font-medium transition-colors hover:text-cyan-400 ${
                pathname === l.to ? 'text-cyan-400' : 'text-gray-400'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
