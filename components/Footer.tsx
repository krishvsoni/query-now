import { BookOpenText } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-primary/20 py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-card/20">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BookOpenText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-foreground">QueryNow</div>
              <div className="text-xs">© {new Date().getFullYear()} krishsoni.co</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full border border-primary/30 bg-primary/10">Secure & Commercial-Ready</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
