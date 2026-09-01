import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { signIn } from '@/services/auth'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn.email({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message ?? 'Something went wrong')
      return
    }
    navigate('/')
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex justify-center"><BrandLogo className="h-9" /></div>
        <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Enter your email and password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} size="lg" className="mt-1 w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
        </Card>
      </div>
    </main>
  )
}
