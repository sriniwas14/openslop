import { Menu } from 'lucide-react'
import { signOut, useSession } from '@/services/auth'
import { Button } from '@/components/ui/button'

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data: session } = useSession()
  const email = session?.user.email ?? ''
  const initial = email ? email[0]?.toUpperCase() : '?'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
        <span className="hidden text-sm text-muted-foreground md:inline">Dashboard</span>
      </div>

      <div className="flex items-center gap-3">
        {session ? (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid size-7 place-items-center rounded-full border bg-muted/50 text-xs font-medium">{initial}</div>
              <span className="max-w-40 truncate text-sm text-muted-foreground">{email}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </>
        ) : null}
      </div>
    </header>
  )
}
