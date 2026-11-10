import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage({
  title = "Page not found",
  message = "The link may be wrong or the page was removed.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
