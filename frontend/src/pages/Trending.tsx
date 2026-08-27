import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Trending() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Trending</h1>
      <Card>
        <CardHeader>
          <CardTitle>Trending</CardTitle>
          <CardDescription>What’s popular right now</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Trending content goes here.</CardContent>
      </Card>
    </div>
  )
}
