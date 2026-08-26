import { createAuthClient } from 'better-auth/react'

// ponytail: same-origin via Vite dev proxy (/api -> localhost:3000); set baseURL here when deployed apart
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
