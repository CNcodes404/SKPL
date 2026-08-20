export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-primary-950 py-8 text-primary-200">
      <div className="container flex flex-col items-center justify-between gap-4 text-sm sm:flex-row">
        <div className="flex items-center gap-2">
          <img src="/skpl-logo.png" alt="SKPL" className="h-7 w-7 rounded object-contain" />
          <span className="font-display font-bold text-white">Smash Karts Premier League</span>
        </div>
        <p className="text-xs text-primary-300">© {new Date().getFullYear()} SKPL. All rights reserved.</p>
      </div>
    </footer>
  )
}
