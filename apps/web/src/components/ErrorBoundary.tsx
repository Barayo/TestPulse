import { Component, type ReactNode } from 'react'
import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BrandMark } from '@/components/BrandMark'
import { reportClientError } from '@/lib/reportClientError'

type Props = { children: ReactNode }
type State = { hasError: boolean }

// Wraps <App /> in main.tsx, outside every provider (add-frontend-error-
// reporting design.md D4) — a crash inside AuthProvider/ThemeProvider/
// DataRevisionProvider itself must still be caught, so this sits at the
// outermost point. React only supports error boundaries as class
// components (componentDidCatch has no hook equivalent).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportClientError({
      kind: 'crash',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      url: window.location.pathname,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-foreground">
        <div className="flex items-center gap-1.5 text-[24px] leading-none opacity-90">
          <BrandMark />
        </div>
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary-foreground">
              <TriangleAlertIcon className="size-4" aria-hidden="true" />
            </span>
            <div role="alert" className="space-y-1">
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm text-muted-foreground">
                TestPulse hit an unexpected error and couldn't continue. Reloading the page usually fixes it.
              </p>
            </div>
            <Button type="button" className="w-full" onClick={() => window.location.reload()}>
              <RefreshCwIcon aria-hidden="true" />
              Reload page
            </Button>
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back to projects
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }
}
