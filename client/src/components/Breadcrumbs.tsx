import { Fragment } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

/** "Home › Meetings". The last item is the current page (not a link). */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <Fragment key={item.label}>
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            <li>
              {item.to && i < items.length - 1 ? (
                <Link to={item.to} className="rounded-md px-1 py-0.5 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="px-1 font-medium text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
