import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ContentPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
          <CardDescription>Manage your content library</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Content goes here.</CardContent>
      </Card>
    </div>
  )
}
