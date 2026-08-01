import { useState, useMemo, useRef, useEffect } from 'react'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { SCREEN_TYPES } from '../constants'

function CreateScreenModal({ onClose, onCreate }) {
  const [key,  setKey]  = useState('')
  const [type, setType] = useState('SECTION')

  const handle = () => {
    if (!key.trim()) return toast.error('Key required')
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    onCreate({ key: cleanKey, type, label: cleanKey })
  }

  return (
    <Modal open onClose={onClose} title="New screen"
      subtitle="Choose the screen type — this determines what you can configure"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handle}>Create</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Screen key <span className="text-status-fail-fg">*</span></label>
          <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="e.g. vendor_question_item"
            autoFocus
            className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-2">Screen type</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(SCREEN_TYPES).map(t => (
              <button key={t.key} onClick={() => setType(t.key)}
                className={cn('flex items-start gap-2.5 p-3 rounded-card border text-left transition-all',
                  type === t.key ? 'border-brand-500 bg-brand-500/8' : 'border-border hover:border-border-strong')}>
                <div className={cn('w-7 h-7 rounded-card flex items-center justify-center shrink-0 border', t.color)}>
                  <t.icon size={13} />
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">{t.label}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{t.desc}</div>
                  <code className="text-[8px] font-mono text-text-muted/60 mt-1 block">{t.fieldName}</code>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}


export { CreateScreenModal }
