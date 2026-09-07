import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useBeforeUnload } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Settings2, Sparkles, FileWarning, FileEdit } from 'lucide-react'
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
import { PageSkeleton, EmptyState } from '../../../components/ui/EmptyState'
import { AutoTextarea } from './components/AutoTextarea'
import { Button } from '../../../components/ui/Button'
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

/**
 * Fetch out here; edit in there.
 *
 * ── THE BUG THIS FIXES ───────────────────────────────────────────────────────
 * useBlocks seeds its state with useState(() => withIds(initial)), and an
 * initialiser runs exactly once — on the first render. On a cold cache the
 * first render has no data, so the editor initialised with an empty array and
 * stayed empty no matter what arrived afterwards.
 *
 * It looked intermittent because React Query made it intermittent. Navigate
 * away and back and the post is already in cache, so the first render DOES have
 * data and everything works. First visit after a reload: nothing.
 *
 * The early `if (loaded.isLoading) return <PageSkeleton />` did not help. Hooks
 * run before any return, so useBlocks had already committed to [].
 *
 * ── WHY THIS MATTERED MORE THAN IT LOOKED ────────────────────────────────────
 * An empty canvas over a full post is one keystroke away from data loss:
 * typing into it makes the block array [something], and autosave writes that
 * over fourteen sections. The revision history would have held the previous
 * state, but nothing would have told you to go looking.
 */
export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const postId = Number(id)
  const loaded = usePost(postId)

  if (loaded.isLoading || (!loaded.data && !loaded.isError)) return <PageSkeleton />

  if (loaded.isError || !loaded.data) {
    return (
      <EmptyState
        icon={FileWarning}
        title="This post didn’t load"
        description="It may have been archived, or the content service didn’t respond."
        action={<Button variant="secondary" onClick={() => navigate('/admin/content/posts')}>
          Back to all posts
        </Button>}
      />
    )
  }

  // key: switching between two posts must not reuse the first one's block
  // state, undo stack or autosave queue.
  return <PostEditor key={postId} postId={postId} initialPost={loaded.data} />
}

function PostEditor({ postId, initialPost }) {
  const navigate = useNavigate()
  const client = useQueryClient()

  const taxonomy = useContentTaxonomy()
  const { save, saveNow, status: saveStatus, savedAt } = useAutosave(postId)
  const { publish, publishing, problems, setProblems } = usePublish(postId)

  const [post, setPost] = useState(initialPost)
  const [tab, setTab] = useState('seo')
  // AI is an accelerator, never a dependency: a post is written, saved and
  // published without it. When no provider is configured the tab is not shown.
  const aiEnabled = useAiEnabled()
  const tabs = useMemo(() => TABS.filter((t) => !t.requiresAi || aiEnabled), [aiEnabled])
  const [activeBlock, setActiveBlock] = useState(null)
  const [mediaTarget, setMediaTarget] = useState(null)   // 'hero' | 'og' | blockId
  const [showRevisions, setShowRevisions] = useState(false)

  /**
   * A live post is editable — into a working copy, not onto the article.
   *
   * There is one row per post and the public API reads it directly, so while a
   * post is PUBLISHED its row IS the live article. Autosaving into it put a
   * half-typed sentence in front of readers, and the build hook shipped it
   * about ninety seconds later.
   *
   * The server now routes autosaves on a published post into
   * content_post_drafts and leaves the live row alone. So typing here is safe,
   * the page stays up, and what changes is the release step.
   */
  const isLive = post?.status === 'PUBLISHED'
  const hasDraft = !!post?.hasUnpublishedChanges

  /**
   * Releasing takes seconds, so it has to look like it is working.
   *
   * publish-changes runs 23 queries — it applies the draft, rewrites the link
   * graph, may record a slug redirect and fires the build hook. The log has it
   * at 3.5s. Both buttons were raw onClick handlers with no state, so for those
   * three and a half seconds nothing moved and the obvious response was to
   * press again — which would have released twice and, on the second pass,
   * failed with NO_DRAFT.
   */
  const [releasing, setReleasing] = useState(null)   // 'release' | 'discard' | null

  const releaseChanges = async () => {
    setReleasing('release')
    try {
      // Flush first: the last two seconds of typing are still queued, and
      // releasing without them ships a version the writer never saw.
      await saveNow()
      await contentApi.publishChanges(postId)
      await client.invalidateQueries({ queryKey: ['content-post', postId] })
      toast.success('Changes are live')
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Could not release those changes')
    } finally {
      setReleasing(null)
    }
  }

  const discardChanges = async () => {
    setReleasing('discard')
    try {
      await contentApi.discardDraft(postId)
      await client.invalidateQueries({ queryKey: ['content-post', postId] })
      toast.success('Changes discarded')
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Could not discard')
    } finally {
      setReleasing(null)
    }
  }

  const onBlocksChange = useCallback((next) => {
    save({ contentBlocks: JSON.stringify(next) })
  }, [save])

  const blockApi = useBlocks(
    // Parsed once. initialPost is guaranteed to exist — the wrapper does not
    // render this component until it does.
    useMemo(() => {
      try { return JSON.parse(initialPost.contentBlocks || '[]') } catch { return [] }
    }, [initialPost.contentBlocks]),
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

  /**
   * Flush on the way out, and drop the cached copy of this post.
   *
   * useAutosave invalidates the LIST query but not this post's detail query, so
   * ['content-post', 7] still held whatever the server returned when the editor
   * opened. Navigate away and back and React Query hands that stale copy
   * straight to the new editor — your edits are on the server and not on the
   * screen, and the next keystroke saves the old version back over them.
   *
   * Invalidating here rather than after every autosave is deliberate: doing it
   * on save would refetch the whole post every two seconds while someone types,
   * to produce data this component ignores by design.
   */
  useEffect(() => () => {
    saveNow()
    client.invalidateQueries({ queryKey: ['content-post', postId] })
  }, [saveNow, client, postId])

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

  /** null clears the slot — the picker's Remove sends it. */
  const onMediaSelected = (asset) => {
    const id = asset?.id ?? null
    if (mediaTarget === 'hero') patchPost({ heroImageId: id })
    else if (mediaTarget === 'og') patchPost({ ogImageId: id })
    else if (mediaTarget) blockApi.patch(mediaTarget, { mediaId: id })
    setMediaTarget(null)
  }

  /**
   * What the slot being edited already holds.
   *
   * The picker had no idea, so it could not show you the current choice or
   * offer to clear it — opening it to "replace" gave you a grid with nothing
   * marked as selected.
   */
  const currentMediaId =
    mediaTarget === 'hero' ? post?.heroImageId
    : mediaTarget === 'og' ? post?.ogImageId
    : mediaTarget ? blockApi.blocks.find((b) => b._id === mediaTarget)?.mediaId
    : null

  if (!post) return <PageSkeleton />

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

      {isLive && (
        <div className="flex items-center gap-3 border-b border-border-subtle bg-status-info-bg px-5 py-2.5">
          <FileEdit size={13} className="shrink-0 text-status-info-fg" />
          <p className="min-w-0 flex-1 text-[12.5px] text-status-info-fg">
            {hasDraft ? (
              <><strong>Unpublished changes.</strong> The live article still shows the
              last published version — these go out when you release them.</>
            ) : (
              <><strong>This article is live.</strong> Edits save as a working copy;
              readers keep seeing the published version until you release them.</>
            )}
          </p>
          {hasDraft && (
            <>
              <Button size="sm" variant="ghost"
                      onClick={discardChanges}
                      loading={releasing === 'discard'} loadingText="Discarding…"
                      disabled={!!releasing}>
                Discard
              </Button>
              <Button size="sm" variant="primary"
                      onClick={releaseChanges}
                      loading={releasing === 'release'} loadingText="Releasing…"
                      disabled={!!releasing}>
                Release changes
              </Button>
            </>
          )}
        </div>
      )}

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
            <AutoTextarea
              value={post.title || ''}
              onChange={(e) => patchPost({ title: e.target.value })}
              placeholder="Headline"
              className="w-full border-0 bg-transparent p-0 text-[32px] font-bold leading-tight text-text-primary placeholder:font-normal placeholder:text-text-faint focus:outline-none focus:ring-0"
            />
            <AutoTextarea
              value={post.subtitle || ''}
              onChange={(e) => patchPost({ subtitle: e.target.value })}
              placeholder="One sentence expanding on the promise of the headline"
              className="mt-3 w-full border-0 bg-transparent p-0 text-[17px] leading-relaxed text-text-secondary placeholder:text-text-faint focus:outline-none focus:ring-0"
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
                postId={postId}
                aiEnabled={aiEnabled}
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
                // Passing blockApi.blocks (which carry _id) rather than
                // stripped copies: useBlocks keeps an existing _id and only
                // mints new ones, so untouched blocks keep their identity and
                // their editors are not remounted — which would drop the caret.
                onAppendBlocks={(list) => blockApi.replaceAll([...blockApi.blocks, ...list])}
                onPrependBlock={(b) => blockApi.replaceAll([b, ...blockApi.blocks])}
                onTransformBlocks={(fn) => blockApi.replaceAll(fn(blockApi.blocks))}
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
        currentId={currentMediaId}
      />
      <RevisionDrawer
        open={showRevisions}
        onClose={() => setShowRevisions(false)}
        postId={postId}
      />
    </div>
  )
}