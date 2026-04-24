import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn(
        'relative w-full bg-surface-raised rounded-xl border border-border shadow-elevated',
        'animate-slide-up max-h-[90vh] flex flex-col',
        sizes[size]
      )}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'danger', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 text-sm text-text-secondary hover:text-text-primary rounded-md hover:bg-surface-overlay transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'h-8 px-4 text-sm font-medium rounded-md transition-all',
              variant === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-brand-500 text-white hover:bg-brand-600',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">{message}</p>
    </Modal>
  )
}
