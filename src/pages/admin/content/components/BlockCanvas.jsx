import { useRef, useState } from 'react'
import { GripVertical, Plus, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react'
import { BlockEditor } from './blocks'
import { BlockPicker } from './BlockPicker'
import { blocks as factories } from '../../../../api/content.api'
import { cn } from '../../../../lib/cn'

/**
 * The centre column: the blocks themselves.
 *
 * ── DRAG WITHOUT A DRAG LIBRARY ──────────────────────────────────────────────
 * Native HTML5 drag-and-drop, because the alternative pulls in a dependency to
 * reorder a list of fifteen things. The one thing it needs care with: a
 * draggable ancestor makes text selection inside a contenteditable child
 * unreliable, so only the grip handle carries `draggable`, not the row.
 *
 * The keyboard equivalents (the up/down buttons) are not an afterthought —
 * drag-and-drop is unusable with a keyboard, and this screen has to survive an
 * accessibility review from people who sell compliance software.
 */
export function BlockCanvas({
  blocks, patch, remove, duplicate, move, insertAt, replaceBlock,
  onPickMedia, onAiRewrite, media, competitors,
}) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [pickerAt, setPickerAt] = useState(null)
  const [focused, setFocused] = useState(null)

  /**
   * The picker opened FROM a block, rather than from the hairline between two.
   *
   * The hairline plus is a fine way to insert something between two finished
   * paragraphs, but it is the wrong affordance for "I am on an empty line and I
   * want a table". It only appears on hover, it sits between blocks rather than
   * on the one you are in, and it inserts a second block instead of becoming
   * the one you are already looking at. Medium and Notion both put the control
   * on the line itself for exactly this reason.
   */
  const [pickerFor, setPickerFor] = useState(null)   // block id | null

  /** An empty paragraph is a placeholder, not content — picking replaces it. */
  const isBlankParagraph = (b) =>
    b.type === 'paragraph' && !String(b.html || '').replace(/<[^>]*>/g, '').trim()

  // The block that should take the caret on its next render. Cleared as soon as
  // it is consumed, so a re-render for any other reason does not yank focus
  // back — which is what makes autofocus feel possessed.
  const [focusId, setFocusId] = useState(null)
  const claimFocus = (id) => {
    if (focusId !== id) return false
    queueMicrotask(() => setFocusId((cur) => (cur === id ? null : cur)))
    return true
  }

  /**
   * Typing rather than picking.
   *
   * The plus menu is fine for a table or a callout, and unbearable as the only
   * way to write a second paragraph. These three give the keyboard path:
   *
   *   Enter at the end of a block  -> a new paragraph below, focused
   *   Backspace in an empty block  -> remove it, caret to the block above
   *   "/" in an empty block        -> the picker, at the caret
   *
   * Plus "## " and "```", which convert the block in place. Everything else —
   * lists, quotes, bold — is left to TipTap's own input rules, because those
   * render correctly inside a paragraph and need no block of their own.
   */
  const flowFor = (block, i) => ({
    autoFocus: claimFocus(block._id),

    onEnterAtEnd: () => {
      const id = insertAt(i + 1, factories.paragraph(''))
      setFocusId(id)
    },

    onDeleteEmpty: () => {
      // Never delete the only block: the canvas would fall back to its empty
      // state and the caret would have nowhere to go.
      if (blocks.length <= 1) return
      const previous = blocks[i - 1]
      remove(block._id)
      if (previous) setFocusId(previous._id)
    },

    // "/" opens the picker ON this block, not below it.
    onSlash: () => setPickerFor(block._id),

    onConvert: (spec) => {
      if (spec.type === 'heading') {
        replaceBlock(block._id, { ...factories.heading(spec.text, spec.level) })
      } else if (spec.type === 'code') {
        replaceBlock(block._id, { ...factories.code(), language: spec.language })
      }
    },
  })

  const commitDrop = (to) => {
    if (dragIndex !== null && to !== dragIndex) move(dragIndex, to)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex flex-col">
      <InsertPoint
        open={pickerAt === 0}
        onToggle={() => setPickerAt(pickerAt === 0 ? null : 0)}
        onPick={(b) => { setFocusId(insertAt(0, b)); setPickerAt(null) }}
      />

      {blocks.map((block, i) => (
        <div key={block._id}>
          <div
            onDragOver={(e) => { e.preventDefault(); setOverIndex(i) }}
            onDrop={() => commitDrop(i)}
            onFocusCapture={() => setFocused(block._id)}
            className={cn(
              'group relative rounded-card border border-transparent px-3 py-3 transition-colors',
              focused === block._id && 'border-border-subtle bg-surface-inset',
              overIndex === i && dragIndex !== null && 'border-brand-500',
              dragIndex === i && 'opacity-40'
            )}
          >
            {/* Controls sit outside the content column so they never reflow the
                text while someone is reading it back. */}
            <div className={cn(
              'absolute -left-9 top-3 flex flex-col items-center gap-0.5 transition-opacity',
              // Always visible on a blank line. That is the moment someone is
              // deciding what to write next, and hiding the control behind a
              // hover is what made it invisible.
              isBlankParagraph(block)
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            )}>
              <button
                type="button"
                onClick={() => setPickerFor(pickerFor === block._id ? null : block._id)}
                aria-label="Insert a block"
                title="Insert a block  ( / )"
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-badge transition-colors',
                  pickerFor === block._id
                    ? 'bg-brand-500 text-brand-900'
                    : 'text-text-faint hover:bg-surface-overlay hover:text-text-primary'
                )}
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                className="cursor-grab text-text-faint hover:text-text-secondary active:cursor-grabbing"
                aria-label="Drag to reorder"
              >
                <GripVertical size={15} />
              </button>
              <button type="button" onClick={() => move(i, Math.max(0, i - 1))}
                      disabled={i === 0}
                      className="text-text-faint hover:text-text-secondary disabled:opacity-30"
                      aria-label="Move up">
                <ChevronUp size={13} />
              </button>
              <button type="button" onClick={() => move(i, Math.min(blocks.length - 1, i + 1))}
                      disabled={i === blocks.length - 1}
                      className="text-text-faint hover:text-text-secondary disabled:opacity-30"
                      aria-label="Move down">
                <ChevronDown size={13} />
              </button>
            </div>

            <div className="absolute -right-9 top-3 flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" onClick={() => duplicate(block._id)}
                      className="text-text-faint hover:text-text-secondary" aria-label="Duplicate">
                <Copy size={13} />
              </button>
              <button type="button" onClick={() => remove(block._id)}
                      className="text-text-faint hover:text-status-fail-fg" aria-label="Delete block">
                <Trash2 size={13} />
              </button>
            </div>

            {pickerFor === block._id && (
              <div className="absolute left-3 top-full z-30 mt-1">
                <BlockPicker
                  onClose={() => setPickerFor(null)}
                  onPick={(b) => {
                    // Replace the blank line rather than inserting under it,
                    // so choosing "Table" does not leave the empty paragraph
                    // you were standing on behind.
                    const id = isBlankParagraph(block)
                      ? replaceBlock(block._id, b)
                      : insertAt(i + 1, b)
                    setFocusId(id)
                    setPickerFor(null)
                  }}
                />
              </div>
            )}

            <BlockEditor
              block={block}
              flow={flowFor(block, i)}
              patch={(changes) => patch(block._id, changes)}
              onPickMedia={() => onPickMedia(block._id)}
              onAiRewrite={block.type === 'paragraph' ? onAiRewrite : undefined}
              media={media}
              competitors={competitors}
            />
          </div>

          <InsertPoint
            open={pickerAt === i + 1}
            onToggle={() => setPickerAt(pickerAt === i + 1 ? null : i + 1)}
            onPick={(b) => { setFocusId(insertAt(i + 1, b)); setPickerAt(null) }}
          />
        </div>
      ))}

      {blocks.length === 0 && (
        <button
          type="button"
          // Straight into a paragraph. Opening the picker here asked the writer
          // to categorise their first sentence before writing it.
          onClick={() => setFocusId(insertAt(0, factories.paragraph('')))}
          className="rounded-card border border-dashed border-border px-6 py-12 text-center text-sm text-text-faint transition-colors hover:border-brand-500 hover:text-brand-900"
        >
          Start writing — press / for a block, or the plus to insert one
        </button>
      )}
    </div>
  )
}

/**
 * The hairline between blocks. Invisible until hovered, which keeps a
 * forty-block article from looking like a form.
 */
function InsertPoint({ open, onToggle, onPick }) {
  return (
    <div className="relative h-3 group/insert">
      <div className={cn(
        'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-brand-500 transition-opacity',
        open ? 'opacity-100' : 'opacity-0 group-hover/insert:opacity-60'
      )} />
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-badge border border-border bg-surface text-text-secondary shadow-elevated transition-opacity',
          open ? 'opacity-100' : 'opacity-0 group-hover/insert:opacity-100'
        )}
        aria-label="Insert block here"
      >
        <Plus size={12} />
      </button>

      {open && (
        <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2">
          <BlockPicker onPick={onPick} onClose={onToggle} />
        </div>
      )}
    </div>
  )
}