import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * The block array, as editor state.
 *
 * ── WHY IDs EXIST ONLY IN THE CLIENT ─────────────────────────────────────────
 * The stored block array has no ids — the server hashes it to decide whether
 * content changed, and a random id per block would make every save look like a
 * change. So ids are assigned on load, live only here, and are stripped before
 * every save.
 *
 * They are not optional though: React keys by array index reuse the wrong DOM
 * node when a block is dragged, which in a rich-text editor means the caret
 * jumps into a different paragraph mid-sentence. That bug reads as data
 * corruption to the person typing.
 *
 * ── UNDO ─────────────────────────────────────────────────────────────────────
 * The browser's own undo covers text inside one block. It does not cover
 * deleting a block, reordering, or accepting an AI proposal — the three
 * operations that lose the most work. Those push onto this stack.
 */

let seq = 0
const nextId = () => `b${++seq}`

const withIds = (blocks) => blocks.map((b) => ({ ...b, _id: b._id || nextId() }))
export const stripIds = (blocks) => blocks.map(({ _id, ...rest }) => rest)

const UNDO_DEPTH = 40

export function useBlocks(initial = [], onChange) {
  const [blocks, setBlocks] = useState(() => withIds(initial))
  const undoStack = useRef([])
  const redoStack = useRef([])

  /**
   * `checkpoint` marks a change worth undoing as one step. Typing inside a
   * block does not checkpoint — the browser already handles that, and pushing
   * per keystroke would make undo useless.
   */
  const commit = useCallback((next, { checkpoint = false } = {}) => {
    setBlocks((prev) => {
      if (checkpoint) {
        undoStack.current.push(prev)
        if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift()
        redoStack.current = []
      }
      const value = typeof next === 'function' ? next(prev) : next
      onChange?.(stripIds(value))
      return value
    })
  }, [onChange])

  /**
   * Returns the id of the block it created.
   *
   * The id is minted here rather than inside the state updater because the
   * caller needs it NOW — to focus the block it just inserted. An updater runs
   * later and its return value goes to React, not to us.
   */
  const insertAt = useCallback((index, block) => {
    const id = nextId()
    commit((prev) => {
      const copy = [...prev]
      copy.splice(index, 0, { ...block, _id: id })
      return copy
    }, { checkpoint: true })
    return id
  }, [commit])

  const append = useCallback((block) => {
    const id = nextId()
    commit((prev) => [...prev, { ...block, _id: id }], { checkpoint: true })
    return id
  }, [commit])

  /**
   * Swap a block for a different type in place, keeping its position and id.
   *
   * Typing "## " in a paragraph should turn that paragraph into a heading — not
   * insert a heading below it and leave an empty paragraph behind, which is what
   * insert-then-delete would do and what makes an editor feel like it is
   * fighting you.
   */
  const replaceBlock = useCallback((id, block) => {
    commit((prev) => prev.map((b) => (b._id === id ? { ...block, _id: id } : b)),
           { checkpoint: true })
    return id
  }, [commit])

  /** Patch one block. Not a checkpoint — this is what typing calls. */
  const patch = useCallback((id, changes) => {
    commit((prev) => prev.map((b) => (b._id === id ? { ...b, ...changes } : b)))
  }, [commit])

  const remove = useCallback((id) => {
    commit((prev) => prev.filter((b) => b._id !== id), { checkpoint: true })
  }, [commit])

  const duplicate = useCallback((id) => {
    commit((prev) => {
      const i = prev.findIndex((b) => b._id === id)
      if (i < 0) return prev
      const copy = [...prev]
      copy.splice(i + 1, 0, { ...prev[i], _id: nextId() })
      return copy
    }, { checkpoint: true })
  }, [commit])

  const move = useCallback((from, to) => {
    if (from === to) return
    commit((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    }, { checkpoint: true })
  }, [commit])

  /** Used by the AI panel when a proposal is accepted. Always a checkpoint. */
  const replaceAll = useCallback((next) => {
    commit(withIds(next), { checkpoint: true })
  }, [commit])

  const undo = useCallback(() => {
    setBlocks((prev) => {
      const last = undoStack.current.pop()
      if (!last) return prev
      redoStack.current.push(prev)
      onChange?.(stripIds(last))
      return last
    })
  }, [onChange])

  const redo = useCallback(() => {
    setBlocks((prev) => {
      const next = redoStack.current.pop()
      if (!next) return prev
      undoStack.current.push(prev)
      onChange?.(stripIds(next))
      return next
    })
  }, [onChange])

  /**
   * Outline entries, for the left rail. Headings carry their level so the rail
   * can indent; everything else shows a one-line preview of its own content,
   * which is what makes a 40-block article navigable.
   */
  const outline = useMemo(() => blocks.map((b, i) => ({
    id: b._id,
    index: i,
    type: b.type,
    level: b.type === 'heading' ? b.level || 2 : null,
    label: previewOf(b),
  })), [blocks])

  /** Mirrors the server's read-time rule so the editor and the article agree. */
  const stats = useMemo(() => {
    const words = blocks.reduce((n, b) => n + countWords(b), 0)
    return { words, readTime: Math.max(1, Math.ceil(words / 200)) }
  }, [blocks])

  return {
    blocks, outline, stats,
    insertAt, append, patch, remove, duplicate, move, replaceAll, replaceBlock,
    undo, redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  }
}

const text = (html = '') => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function previewOf(b) {
  switch (b.type) {
    case 'heading':    return b.text || 'Untitled heading'
    case 'paragraph':  return text(b.html) || 'Empty paragraph'
    case 'tldr':       return 'Key takeaways'
    case 'callout':    return b.title || `${b.variant || 'note'} callout`
    case 'table':      return (b.headers || []).filter(Boolean).join(' · ') || 'Table'
    case 'faq':        return `FAQ — ${(b.items || []).length} questions`
    case 'steps':      return `Steps — ${(b.items || []).length}`
    case 'quote':      return text(b.text) || 'Quote'
    case 'list':       return (b.items || [])[0] || 'List'
    case 'image':      return b.caption || 'Image'
    case 'code':       return `Code — ${b.language || 'text'}`
    case 'cta':        return b.heading || 'Call to action'
    case 'download':   return b.title || 'Download'
    case 'embed':      return b.url || `${b.provider || 'embed'}`
    case 'comparison': return 'Comparison table'
    default:           return b.type
  }
}

function countWords(b) {
  const parts = []
  switch (b.type) {
    case 'paragraph': case 'callout': parts.push(text(b.html)); break
    case 'heading': case 'quote':     parts.push(b.text || ''); break
    case 'list': case 'tldr':         parts.push((b.items || []).join(' ')); break
    case 'table':
      parts.push((b.headers || []).join(' '))
      ;(b.rows || []).forEach((r) => parts.push(r.join(' ')))
      break
    case 'faq':   (b.items || []).forEach((i) => parts.push(`${i.q} ${i.a}`)); break
    case 'steps': (b.items || []).forEach((i) => parts.push(`${i.heading} ${text(i.html)}`)); break
    default: break
  }
  const joined = parts.join(' ').trim()
  return joined ? joined.split(/\s+/).length : 0
}