import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "cn";

// Same look as alert-dialog.tsx, for forms (closes on Escape / outside click, focus is trapped inside).
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-3xl bg-popover p-5 text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-100 outline-none sm:p-6 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn("pr-10 text-lg font-semibold", className)} {...p} />
);
const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={cn("-mt-2 text-sm text-muted-foreground", className)} {...p} />
);

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
