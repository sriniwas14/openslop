import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Overview of your workspace</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Dashboard content goes here.
        </CardContent>
      </Card>
    </div>
  )
}
