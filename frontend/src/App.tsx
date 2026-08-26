import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { signOut, useSession } from '@/services/auth'
import SignIn from '@/pages/SignIn'
import SignUp from '@/pages/SignUp'
import { Button } from '@/components/ui/button'

function Home() {
  const { data: session, isPending } = useSession()

  if (isPending) return <main className="grid min-h-svh place-items-center">Loading…</main>

  return (
    <main className="grid min-h-svh place-items-center p-4 text-center">
      <div className="grid gap-4">
        {session ? (
          <>
            <h1 className="text-2xl font-medium">Signed in as {session.user.email}</h1>
            <Button onClick={() => signOut()}>Sign out</Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium">Welcome</h1>
            <div className="flex justify-center gap-2">
              <Button asChild>
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
      </Routes>
    </BrowserRouter>
  )
}
