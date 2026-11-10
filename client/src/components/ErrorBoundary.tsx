import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render crashes so the user sees a friendly card instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => (location.href = "/")}>
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
