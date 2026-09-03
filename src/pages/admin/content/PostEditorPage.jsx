import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useBeforeUnload } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Settings2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { contentApi } from '../../../api/content.api'
import { usePost, useContentTaxonomy, useAutosave, usePublish, useAiEnabled } from '../../../hooks/useContent'
import { useBlocks, stripIds } from './useBlocks'
import { BlockOutline } from './components/BlockOutline'
import { BlockCanvas } from './components/BlockCanvas'
import { SeoPanel } from './components/SeoPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { AiPanel } from './components/AiPanel'
import { MediaPicker } from './components/MediaPicker'
import { RevisionDrawer } from './components/RevisionDrawer'
import { PublishBar } from './components/PublishBar'
import { PageSkeleton } from '../../../components/ui/EmptyState'
import { cn } from '../../../lib/cn'

/**
 * The editor. Three columns: outline, canvas, panels.
 *
 * ── LOCAL STATE IS THE SOURCE OF TRUTH WHILE EDITING ─────────────────────────
 * The server copy is loaded once and then not read again until navigation. That
 * is deliberate: a query refetch landing mid-sentence would replace what the
 * person is typing with what the server last heard, which is a data-loss bug
 * wearing a cache-invalidation costume.
 *
 * Everything flows one way — local state renders, changes queue into autosave,
 * autosave reports status. Nothing flows back.
 */
const TABS = [
  { key: 'seo',      label: 'SEO',      icon: Search },
  { key: 'settings', label: 'Settings', icon: Settings2 },
  { key: 'ai',       label: 'AI',       icon: Sparkles, requiresAi: true },
]

export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const postId = Number(id)

  const loaded = usePost(postId)
  const taxonomy = useContentTaxonomy()
  const { save, saveNow, status: saveStatus, savedAt } = useAutosave(postId)
  const { publish, publishing, problems, setProblems } = usePublish(postId)

  const [post, setPost] = useState(null)
  const [tab, setTab] = useState('seo')
  // AI is an accelerator, never a dependency: a post is written, saved and
  // published without it. When no provider is configured the tab is not shown.
  const aiEnabled = useAiEnabled()
  const tabs = useMemo(() => TABS.filter((t) => !t.requiresAi || aiEnabled), [aiEnabled])
  const [activeBlock, setActiveBlock] = useState(null)
  const [mediaTarget, setMediaTarget] = useState(null)   // 'hero' | 'og' | blockId
  const [showRevisions, setShowRevisions] = useState(false)
  const hydrated = useRef(false)

  // Hydrate once. See the note above about why this does not track the query.
  useEffect(() => {
    if (loaded.data && !hydrated.current) {
      setPost(loaded.data)
      hydrated.current = true
    }
  }, [loaded.data])

  const onBlocksChange = useCallback((next) => {
    save({ contentBlocks: JSON.stringify(next) })
  }, [save])

  const blockApi = useBlocks(
    useMemo(() => {
      try { return JSON.parse(loaded.data?.contentBlocks || '[]') } catch { return [] }
    }, [loaded.data?.contentBlocks]),
    onBlocksChange
  )

  /** Patch post metadata: local first, then queued for autosave. */
  const patchPost = useCallback((changes) => {
    setPost((p) => ({ ...p, ...changes }))
    save(changes)
  }, [save])

  // Media referenced by blocks, resolved once so the canvas can render
  // thumbnails without a request per image block.
  const mediaLibrary = useQuery({
    queryKey: ['content-media'],
    queryFn: () => contentApi.media({ size: 200 }).then((page) => page?.items ?? []),
    staleTime: 60_000,
  })
  const mediaById = useMemo(() => {
    const map = {}
    ;(mediaLibrary.data || []).forEach((m) => { map[m.id] = m })
    return map
  }, [mediaLibrary.data])

  const competitors = useQuery({
    queryKey: ['content-comparisons'],
    // contentApi.comparisons does not exist yet — the comparison block editor
    // ships before its endpoint. Guarded so the optional call cannot throw:
    // `undefined?.()` is undefined, and `.then` on undefined is a TypeError
    // that ?? never gets to catch.
    queryFn: () => (contentApi.comparisons ? contentApi.comparisons() : Promise.resolve([])),
    enabled: post?.contentType === 'COMPARISON',
  })

  // Flush before leaving. The debounce means up to two seconds of writing is
  // otherwise still in the queue when the route changes.
  useBeforeUnload(useCallback(() => { saveNow() }, [saveNow]))
  useEffect(() => () => { saveNow() }, [saveNow])

  // Cmd/Ctrl-S flushes rather than doing nothing. People press it regardless of
  // whether an app autosaves, and having it appear to do something wrong is
  // worse than having it do the right thing.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveNow().then(() => toast.success('Saved'))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        // Only when focus is not inside a text surface — TipTap owns undo there.
        if (!e.target.closest?.('.ProseMirror')) { e.preventDefault(); blockApi.undo() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow, blockApi])

  const onMediaSelected = (asset) => {
    if (mediaTarget === 'hero') patchPost({ heroImageId: asset.id })
    else if (mediaTarget === 'og') patchPost({ ogImageId: asset.id })
    else if (mediaTarget) blockApi.patch(mediaTarget, { mediaId: asset.id })
    setMediaTarget(null)
  }

  if (loaded.isLoading || !post) return <PageSkeleton />

  const hasBody = blockApi.stats.words > 20

  return (
    <div className="flex h-full flex-col">
      <PublishBar
        post={post}
        saveStatus={saveStatus}
        savedAt={savedAt}
        publishing={publishing}
        problems={problems}
        onDismissProblems={() => setProblems([])}
        onPublish={async () => { await saveNow(); publish() }}
        onUnpublish={() => contentApi.unpublish(postId).then(() => {
          setPost((p) => ({ ...p, status: 'DRAFT' }))
          toast.success('Unpublished')
        })}
        onSchedule={async (when) => {
          await saveNow()
          contentApi.schedule(postId, new Date(when).toISOString())
            .then(() => { setPost((p) => ({ ...p, status: 'SCHEDULED' })); toast.success('Scheduled') })
            .catch((e) => setProblems(e?.response?.data?.error?.details?.problems || []))
        }}
        onPreview={() => window.open(`https://www.digiosec.com/blog/${post.slug}`, '_blank')}
        onOpenRevisions={() => setShowRevisions(true)}
        // Flush before leaving: the debounce means up to two seconds of writing
        // can still be sitting in the queue when the route changes.
        onBack={async () => { await saveNow(); navigate('/admin/content/posts') }}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_20rem]">
        {/* ── left: outline ─────────────────────────────────────────────── */}
        <aside className="min-h-0 border-r border-border-subtle bg-surface">
          <BlockOutline
            outline={blockApi.outline}
            activeId={activeBlock}
            stats={blockApi.stats}
            onJump={(blockId) => {
              setActiveBlock(blockId)
              document.getElementById(`block-${blockId}`)?.scrollIntoView({
                behavior: 'smooth', block: 'center',
              })
            }}
          />
        </aside>

        {/* ── centre: the article ───────────────────────────────────────── */}
        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[46rem] px-12 py-10">
            {/* Title and dek are not blocks. There is exactly one H1 and it is
                this — making it a block would let someone delete it or add a
                second. */}
            <textarea
              value={post.title || ''}
              onChange={(e) => patchPost({ title: e.target.value })}
              placeholder="Headline"
              rows={1}
              className="w-full resize-none border-0 bg-transparent p-0 text-[32px] font-bold leading-tight text-text-primary placeholder:font-normal placeholder:text-text-faint focus:outline-none focus:ring-0"
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
            />
            <textarea
              value={post.subtitle || ''}
              onChange={(e) => patchPost({ subtitle: e.target.value })}
              placeholder="One sentence expanding on the promise of the headline"
              rows={1}
              className="mt-3 w-full resize-none border-0 bg-transparent p-0 text-[17px] leading-relaxed text-text-secondary placeholder:text-text-faint focus:outline-none focus:ring-0"
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
            />

            <div className="mt-8">
              <BlockCanvas
                blocks={blockApi.blocks}
                patch={blockApi.patch}
                remove={blockApi.remove}
                duplicate={blockApi.duplicate}
                move={blockApi.move}
                insertAt={blockApi.insertAt}
                replaceBlock={blockApi.replaceBlock}
                media={mediaById}
                competitors={competitors.data || []}
                onPickMedia={(blockId) => setMediaTarget(blockId)}
                onAiRewrite={(selection, ctx) => {
                  contentApi.ai('CONTENT_REWRITE', { postId, selection })
                    .then((res) => {
                      const text = res?.payload?.text
                      if (!text) return
                      // Replace the selection, not the block. Rewriting a whole
                      // paragraph when someone highlighted one sentence is the
                      // fastest way to lose trust in the feature.
                      ctx.editor.chain().focus()
                        .deleteRange({ from: ctx.from, to: ctx.to })
                        .insertContent(text).run()
                    })
                    .catch(() => toast.error('Rewrite failed'))
                }}
              />
            </div>
          </div>
        </main>

        {/* ── right: panels ─────────────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col border-l border-border-subtle bg-surface">
          <div className="flex shrink-0 border-b border-border-subtle">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12.5px] transition-colors',
                  tab === key
                    ? 'border-b-2 border-brand-800 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'seo' && <SeoPanel post={post} patch={patchPost} postId={postId} />}
            {tab === 'settings' && (
              <SettingsPanel
                post={post}
                patch={patchPost}
                taxonomy={taxonomy}
                media={mediaById}
                onPickHero={() => setMediaTarget('hero')}
                onPickOg={() => setMediaTarget('og')}
              />
            )}
            {tab === 'ai' && aiEnabled && (
              <AiPanel
                postId={postId}
                post={post}
                blocks={blockApi.blocks}
                hasBody={hasBody}
                onInsertBlock={(b) => blockApi.append(b)}
                onPatchPost={patchPost}
              />
            )}
          </div>
        </aside>
      </div>

      <MediaPicker
        open={!!mediaTarget}
        onClose={() => setMediaTarget(null)}
        onSelect={onMediaSelected}
      />
      <RevisionDrawer
        open={showRevisions}
        onClose={() => setShowRevisions(false)}
        postId={postId}
      />
    </div>
  )
}