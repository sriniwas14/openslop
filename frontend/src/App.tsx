import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from '@/services/auth'
import DashboardLayout from '@/layouts/DashboardLayout'
import Dashboard from '@/pages/Dashboard'
import Trending from '@/pages/Trending'
import ContentPage from '@/pages/Content'
import InfluencersPage from '@/pages/Influencers'
import Settings from '@/pages/Settings'
import SignIn from '@/pages/SignIn'
import SignUp from '@/pages/SignUp'
import Onboarding from '@/pages/Onboarding'

function RootRedirect() {
  const { data: session, isPending } = useSession()
  if (isPending) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>
  if (session) return <Navigate to="/dashboard" replace />
  return <Navigate to="/onboarding" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/onboarding/progress" element={<Onboarding />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/trending" element={<Trending />} />
          <Route path="/dashboard/content" element={<ContentPage />} />
          <Route path="/dashboard/influencers" element={<InfluencersPage />} />
          <Route path="/dashboard/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
