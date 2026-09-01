import { NavLink } from 'react-router-dom'
import { FileText, LayoutDashboard, Settings, TrendingUp, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import CompanyCombobox from '@/components/CompanyCombobox'
import BrandLogo from '@/components/BrandLogo'

const topItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/trending', label: 'Trending', icon: TrendingUp },
  { to: '/dashboard/content', label: 'Content', icon: FileText },
  { to: '/dashboard/influencers', label: 'Influencers', icon: Users },
]

const bottomItems = [{ to: '/dashboard/settings', label: 'Settings', icon: Settings }]

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
          isActive
            ? 'bg-accent font-semibold text-accent-foreground'
            : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  return (
    <>
      {/* desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandLogo className="h-7" />
        </div>
        <div className="p-3 pb-0">
          <CompanyCombobox />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <div className="grid gap-1">
            {topItems.map((it) => (
              <NavItem key={it.to} {...it} />
            ))}
          </div>
          <div className="mt-auto grid gap-1 border-t pt-3">
            {bottomItems.map((it) => (
              <NavItem key={it.to} {...it} />
            ))}
          </div>
        </nav>
      </aside>

      {/* mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button type="button" aria-label="Close menu" onClick={onMobileClose} className="flex-1 bg-black/30" />
          <aside className="flex w-64 shrink-0 flex-col border-l bg-sidebar">
            <div className="flex h-14 items-center border-b px-4">
              <BrandLogo className="h-7" />
            </div>
            <div className="p-3 pb-0" onClick={(e) => e.stopPropagation()}>
              <CompanyCombobox />
            </div>
            <nav className="flex flex-1 flex-col gap-1 p-3">
              <div className="grid gap-1" onClick={onMobileClose}>
                {topItems.map((it) => (
                  <NavItem key={it.to} {...it} />
                ))}
              </div>
              <div className="mt-auto grid gap-1 border-t pt-3" onClick={onMobileClose}>
                {bottomItems.map((it) => (
                  <NavItem key={it.to} {...it} />
                ))}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  )
}
