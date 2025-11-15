'use client'

import { RegisterLink, LoginLink } from "@kinde-oss/kinde-auth-nextjs/components"
import { BookOpenText, Menu } from 'lucide-react'
import { useState } from 'react'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-primary/20 shadow-lg shadow-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/50">
            <BookOpenText className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Query-Now</span>
        </div>
        
        {/* Desktop Menu */}
        <div className="hidden sm:flex items-center gap-3">
          <LoginLink className="px-6 py-2.5 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/80 font-semibold transition-all duration-300 hover:shadow-md hover:shadow-primary/20">
            Sign In
          </LoginLink>
          <RegisterLink className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-lg hover:shadow-primary/60 font-semibold transition-all duration-300 border border-primary/50">
            Get Started
          </RegisterLink>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden p-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-all duration-300"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-primary/20 bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-3">
            <LoginLink 
              className="block w-full text-center px-6 py-2.5 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/80 font-semibold transition-all duration-300"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign In
            </LoginLink>
            <RegisterLink 
              className="block w-full text-center px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-lg hover:shadow-primary/60 font-semibold transition-all duration-300 border border-primary/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Get Started
            </RegisterLink>
          </div>
        </div>
      )}
    </nav>
  )
}
