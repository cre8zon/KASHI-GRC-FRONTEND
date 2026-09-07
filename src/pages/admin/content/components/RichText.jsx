import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
// TipTap 3 split the menu components out of the root entry point. Importing
// BubbleMenu from '@tiptap/react' resolves at build time and fails at run time
// with "does not provide an export named 'BubbleMenu'".
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Link2, Link2Off, List, ListOrdered, Highlighter, Sparkles,
} from 'lucide-react'
import { cn } from '../../../../lib/cn'

/**
 * The inline text surface, used inside paragraph, callout, step and FAQ blocks.
 *
 * ── WHY THE TOOLBAR IS A BUBBLE ──────────────────────────────────────────────
 * A persistent toolbar per block would put fifteen toolbars on screen in a long
 * article. The bubble appears on selection, which is also the only moment any
 * of its buttons can do anything.
 *
 * ── NO HEADINGS HERE, DELIBERATELY ───────────────────────────────────────────
 * StarterKit's heading is disabled. Headings are their own block type, because
 * the table of contents, the anchor links and the H2/H3 outline all read the
 * block array — a heading typed inside a paragraph's HTML would be invisible to
 * all three, and the author would have no way to know.
 *
 * ── ON onUpdate ──────────────────────────────────────────────────────────────
 * Fires on every keystroke and calls straight through to the block patch, which
 * feeds autosave's debounce. It does NOT re-render from props: setting content
 * back into TipTap while someone is typing moves the caret to the end. The
 * editor owns its content after mount; `content` is an initial value only.
 */
export function RichText({
  value,
  onChange,
  placeholder = 'Write…',
  className,
  onAiRewrite,
  minimal = false,
  autoFocus = false,
  onEnterAtEnd,
  onDeleteEmpty,
  onSlash,
  onConvert,
}) {
  const lastEmitted = useRef(value)

  // handleKeyDown is captured once when the editor is created, so it cannot
  // close over props directly — it would keep calling the first render's
  // handlers forever. A ref updated every render is the seam.
  const handlers = useRef({})
  handlers.current = { onEnterAtEnd, onDeleteEmpty, onSlash, onConvert }

  // onCreate is captured once, same as handleKeyDown.
  const autoFocusRef = useRef(autoFocus)
  autoFocusRef.current = autoFocus

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Headings are their own block type. The table of contents, the anchor
        // links and the H2/H3 outline all read the block array, so a heading
        // typed inside a paragraph's HTML would be invisible to all three.
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: minimal ? false : undefined,
        bulletList: minimal ? false : undefined,
        orderedList: minimal ? false : undefined,

        // Configured HERE, not imported separately. StarterKit 3 bundles Link
        // (and Underline), so adding @tiptap/extension-link alongside it
        // registers two extensions under the name "link" — TipTap warns about
        // the duplicate and the second registration wins unpredictably.
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
      Highlight,
      Typography,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose-content focus:outline-none min-h-[2rem] text-[15px] leading-[1.7] text-text-primary',
          className
        ),
      },

      /**
       * Enter and Backspace have to reach past this block.
       *
       * Each block is its own editor, so ProseMirror's own Enter only ever
       * makes another paragraph INSIDE this one. Without this, adding a second
       * paragraph means going back to the plus menu every single time — which
       * is the thing that makes a block editor tiring to write in.
       */
      handleKeyDown(view, event) {
        const h = handlers.current
        const { state } = view
        const { $head, empty } = state.selection

        if (event.key === 'Enter' && !event.shiftKey && h.onEnterAtEnd) {
          // Only at the very end of a top-level paragraph. Inside a list or
          // mid-sentence, Enter must keep its normal meaning.
          const atDocEnd = empty && $head.depth === 1 && $head.pos === state.doc.content.size - 1
          if (atDocEnd) {
            event.preventDefault()
            h.onEnterAtEnd()
            return true
          }
        }

        if (event.key === 'Backspace' && h.onDeleteEmpty) {
          // Only when the block is already empty. Merging text across two
          // separate editors is a different and much harder problem; removing
          // an empty block is the case that actually comes up.
          const isEmpty = state.doc.textContent.length === 0
          if (isEmpty && empty && $head.pos <= 1) {
            event.preventDefault()
            h.onDeleteEmpty()
            return true
          }
        }

        return false
      },
    },

    onUpdate: ({ editor: e }) => {
      const html = e.getHTML()
      const text = e.getText()
      const h = handlers.current

      // "/" on an empty block opens the block picker at the caret. Cleared
      // first, so the slash never survives into the saved content.
      if (h.onSlash && text === '/') {
        e.commands.clearContent()
        h.onSlash()
        return
      }

      // Markdown shortcuts that must become a DIFFERENT block, not formatting
      // inside this one. Lists, quotes and bold are left to TipTap's own input
      // rules — they render correctly inside a paragraph and need no block of
      // their own.
      if (h.onConvert) {
        const heading = text.match(/^(#{1,4})\s+(.*)$/)
        if (heading) {
          // "# " maps to H2, not H1. There is exactly one H1 per page and it is
          // the title, which is not a block at all.
          const level = Math.max(2, heading[1].length)
          h.onConvert({ type: 'heading', level: Math.min(level, 4), text: heading[2] })
          return
        }
        const fence = text.match(/^```(\w*)\s?$/)
        if (fence) {
          h.onConvert({ type: 'code', language: fence[1] || 'text' })
          return
        }
      }

      lastEmitted.current = html
      onChange?.(html)
    },

    /**
     * Focus on creation rather than in an effect.
     *
     * An effect that calls editor.commands can run against an editor whose
     * commandManager has already been torn down — StrictMode mounts, unmounts
     * and remounts every component in development, and the effect fires on the
     * corpse. onCreate cannot: it only ever runs on a live instance.
     */
    onCreate: ({ editor: e }) => {
      if (autoFocusRef.current) e.commands.focus('end')
    },
  })

  // Only push external changes in when they did not originate here — an AI
  // proposal being accepted, or a revert. Otherwise the caret jumps.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (value !== lastEmitted.current && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
      lastEmitted.current = value
    }
  }, [value, editor])

  // NO manual destroy here.
  //
  // useEditor owns the editor's lifecycle in TipTap 3 and tears it down on
  // unmount itself. Destroying it a second time from an effect cleanup left a
  // dead instance behind on StrictMode's remount — every later commands call
  // then threw "Cannot read properties of null (reading 'commands')", and the
  // failed render cascaded into React's "Should have a queue" in the parent.

  if (!editor) return null

  const btn = (active) => cn(
    'flex h-7 w-7 items-center justify-center rounded-ctl transition-colors',
    active ? 'bg-brand-500 text-brand-900' : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
  )

  const toggleLink = () => {
    if (editor.isActive('link')) return editor.chain().focus().unsetLink().run()
    const url = window.prompt('Link to')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <>
      <BubbleMenu
        editor={editor}
        // v3 positions with Floating UI, not Tippy. `tippyOptions` is no longer
        // read — React would spread it onto the div as an unknown DOM attribute.
        options={{ placement: 'top', offset: 8 }}
        className="glass-overlay flex items-center gap-0.5 rounded-ctl border border-border p-1 shadow-overlay"
      >
        <button type="button" className={btn(editor.isActive('bold'))} title="Bold"
                onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} title="Italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </button>
        <button type="button" className={btn(editor.isActive('highlight'))} title="Highlight"
                onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Highlighter size={14} />
        </button>
        <button type="button" className={btn(editor.isActive('link'))} title="Link"
                onClick={toggleLink}>
          {editor.isActive('link') ? <Link2Off size={14} /> : <Link2 size={14} />}
        </button>
        {!minimal && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button type="button" className={btn(editor.isActive('bulletList'))} title="Bulleted list"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={14} />
            </button>
            <button type="button" className={btn(editor.isActive('orderedList'))} title="Numbered list"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={14} />
            </button>
          </>
        )}
        {onAiRewrite && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            {/* Sends the SELECTION, not the block. Rewriting a whole block when
                someone highlighted one sentence is the fastest way to lose
                trust in the feature. */}
            <button
              type="button"
              className={btn(false)}
              title="Rewrite selection"
              onClick={() => {
                const { from, to } = editor.state.selection
                const selected = editor.state.doc.textBetween(from, to, ' ')
                if (selected.trim()) onAiRewrite(selected, { from, to, editor })
              }}
            >
              <Sparkles size={14} />
            </button>
          </>
        )}
      </BubbleMenu>

      <EditorContent editor={editor} />
    </>
  )
}