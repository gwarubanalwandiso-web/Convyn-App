import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  action,
  busy,
  returnFocus,
  error,
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            if (returnFocus?.isConnected) {
              event.preventDefault();
              returnFocus.focus();
            }
          }}
        >
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description>
            {description}
          </DialogPrimitive.Description>
          {error && (
            <p className="feedback" role="alert">
              {String(error.message ?? error)}
            </p>
          )}
          {children}
          <div className="actions">
            <button disabled={busy} onClick={action}>
              Confirm
            </button>
            <DialogPrimitive.Close asChild>
              <button className="button-secondary" disabled={busy}>
                Go back
              </button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Close
            className="dialog-close"
            aria-label="Close confirmation"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
