/**
 * TrainingPlayerTab — the only bespoke component in the training module.
 *
 * Everything else rides the generic machinery: the course list and detail come
 * from UniversalModulePage, and linked-items / linked-questions /
 * linked-assignments go through LinkedEntitiesTab on the tab-key convention.
 * This exists because a video with progress tracking, a graded quiz and an
 * attestation cannot be expressed as a form.
 *
 * ── WHAT THE HEARTBEAT ACTUALLY SENDS ─────────────────────────────────────
 * Every HEARTBEAT_SECONDS while playing, it posts the current position and the
 * seconds genuinely played since the last post, measured from `timeupdate`
 * deltas rather than from a timer — a timer keeps counting when the tab is
 * throttled, and would credit watching that did not happen.
 *
 * None of it is trusted. The server clamps the claim to wall-clock elapsed and
 * requires contiguous coverage, real playback and wall-clock time before it
 * marks an item watched. The checks here are for the learner's benefit, not
 * for security.
 *
 * ── WHY SEEKING FORWARD IS BLOCKED, GENTLY ────────────────────────────────
 * Dragging past the furthest point reached snaps back, with an explanation.
 * The server would refuse the completion anyway, but discovering that after
 * sitting through a quiz is a worse experience than being told immediately.
 * Seeking BACKWARD is always allowed — rewatching a section is the behaviour
 * you want to encourage.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlayCircle, CheckCircle2, Lock, FileText, ExternalLink,
  RefreshCw, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'

const HEARTBEAT_SECONDS = 10

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function TrainingPlayerTab({ entity }) {
  const qc = useQueryClient()
  const assignmentId = entity?.id

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-assignment', assignmentId],
    queryFn: () => api.get(`/v1/training/assignments/${assignmentId}`),
    enabled: !!assignmentId,
  })

  // ── THE PLAYBACK URL MUST NOT CHANGE WHILE THE VIDEO IS PLAYING ───────────
  //
  // Playback URLs are minted per request and never stored, which is right. But
  // the progress heartbeat returns the FULL learner payload, so every ten
  // seconds it carried a freshly signed URL — a different string for the same
  // file. setQueryData then replaced the cached object, <video src> changed,
  // and the browser tore down and reloaded the source. Playback stopped at the
  // first heartbeat, about ten to fifteen seconds in, which is exactly what was
  // reported.
  //
  // So the first URL seen for an item is frozen here and reused. The signature
  // is valid for five minutes, comfortably longer than any single item, and a
  // remount gets a fresh one.
  const urlCache = useRef({})

  const items = useMemo(() => {
    const raw = data?.items || []
    return raw.map(i => {
      if (i.playbackUrl && !urlCache.current[i.id]) urlCache.current[i.id] = i.playbackUrl
      return { ...i, playbackUrl: urlCache.current[i.id] || i.playbackUrl }
    })
  }, [data])
  const quiz  = useMemo(() => data?.quiz  || [], [data])

  const [activeItemId, setActiveItemId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [confirmed, setConfirmed] = useState(false)

  // First incomplete item, so reopening resumes where they stopped.
  useEffect(() => {
    if (activeItemId || !items.length) return
    setActiveItemId((items.find(i => !i.completed) || items[0]).id)
  }, [items, activeItemId])

  const activeItem = items.find(i => i.id === activeItemId) || null

  const progressMutation = useMutation({
    mutationFn: (payload) => api.post(`/v1/training/assignments/${assignmentId}/progress`, payload),
    onSuccess: (res) => qc.setQueryData(['training-assignment', assignmentId], res),
  })

  const quizMutation = useMutation({
    mutationFn: () => api.post(`/v1/training/assignments/${assignmentId}/quiz`, { answers }),
    onSuccess: (res) => {
      qc.setQueryData(['training-assignment', assignmentId], res)
      if (res?.quizPassed) toast.success(`Passed with ${res.quizScorePercent}%`)
      else toast.error(`Scored ${res?.quizScorePercent}% — you can retake it`)
    },
    onError: (e) => toast.error(e?.message || 'Could not submit the quiz'),
  })

  const attestMutation = useMutation({
    mutationFn: () => api.post(`/v1/training/assignments/${assignmentId}/attest`, { confirmed: true }),
    onSuccess: (res) => {
      qc.setQueryData(['training-assignment', assignmentId], res)
      qc.invalidateQueries({ queryKey: ['module-list'] })
      toast.success('Recorded. Thank you.')
    },
    onError: (e) => toast.error(e?.message || 'Could not record your confirmation'),
  })

  if (isLoading) return (
    <div className="py-10 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (isError) return (
    <div className="py-12 text-center">
      <AlertTriangle size={18} className="mx-auto text-text-muted opacity-50" />
      <p className="text-sm text-text-muted mt-2">This training could not be loaded.</p>
    </div>
  )

  const done = data?.status === 'COMPLETED'

  // max-w-4xl because the detail page gives a CUSTOM tab no width bound at all
  // — its own form tabs get max-w-3xl, and without something here the player
  // spanned the full width of a wide monitor. Slightly wider than 3xl since a
  // video benefits from the extra room a form does not.
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {done && (
        <div className="flex items-center gap-2 p-3 rounded-card bg-status-pass-bg text-status-pass-fg">
          <CheckCircle2 size={15} />
          <span className="text-xs font-medium">
            Completed{data.completedAt ? ` on ${new Date(data.completedAt).toLocaleDateString()}` : ''}.
            This stays on your record as evidence.
          </span>
        </div>
      )}

      {data?.courseDescription && !done && (
        <p className="text-xs text-text-muted">{data.courseDescription}</p>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {items.map((i, idx) => (
                <button
                  key={i.id}
                  onClick={() => setActiveItemId(i.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-ctl text-[11px] border transition-colors ${
                    i.id === activeItemId
                      ? 'border-brand-500/40 bg-brand-500/10 text-text-primary'
                      : 'border-border text-text-muted hover:text-text-primary'
                  }`}>
                  {i.completed
                    ? <CheckCircle2 size={11} className="text-status-pass-fg" />
                    : <PlayCircle size={11} />}
                  {idx + 1}. {i.title}
                </button>
              ))}
            </div>
          )}

          {activeItem && (
            <ContentItem
              item={activeItem}
              readOnly={done}
              onHeartbeat={(positionSeconds, playedSeconds) =>
                progressMutation.mutate({ itemId: activeItem.id, positionSeconds, playedSeconds })}
            />
          )}
        </div>
      )}

      {/* ── Quiz ────────────────────────────────────────────────────────── */}
      {data?.quizRequired && !done && (
        <div className="rounded-card border border-border bg-surface-secondary p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">
              Quiz — {data.quizPassPercent}% to pass
            </span>
            {data.quizAttempts > 0 && (
              <span className="text-[11px] text-text-muted">
                Best {data.quizScorePercent}% over {data.quizAttempts} attempt
                {data.quizAttempts === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {!data.allContentComplete ? (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <Lock size={12} /> Finish the content above to unlock the quiz.
            </p>
          ) : data.quizPassed ? (
            <p className="flex items-center gap-1.5 text-xs text-status-pass-fg">
              <CheckCircle2 size={12} /> Passed with {data.quizScorePercent}%.
            </p>
          ) : (
            <>
              {quiz.map((q, qi) => (
                <div key={q.id} className="flex flex-col gap-1.5">
                  <p className="text-xs text-text-primary">{qi + 1}. {q.questionText}</p>
                  <div className="flex flex-col gap-1 pl-3">
                    {(q.options || []).map(o => {
                      const multi = q.questionType === 'MULTI_CHOICE'
                      const chosen = (answers[q.id] || []).includes(o.id)
                      return (
                        <label key={o.id}
                          className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                          <input
                            type={multi ? 'checkbox' : 'radio'}
                            name={`q-${q.id}`}
                            checked={chosen}
                            onChange={() => setAnswers(prev => {
                              const current = prev[q.id] || []
                              if (multi) {
                                return { ...prev, [q.id]: chosen
                                  ? current.filter(x => x !== o.id)
                                  : [...current, o.id] }
                              }
                              return { ...prev, [q.id]: [o.id] }
                            })}
                            className="mt-0.5"
                          />
                          <span>{o.optionText}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
              <button
                disabled={quizMutation.isPending || Object.keys(answers).length === 0}
                onClick={() => quizMutation.mutate()}
                className="self-start px-3 py-1.5 text-xs font-medium rounded-ctl bg-brand-500 text-white disabled:opacity-60">
                {quizMutation.isPending ? 'Submitting…' : 'Submit answers'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Attestation ─────────────────────────────────────────────────── */}
      {data?.attestationRequired && !done && (
        <div className="rounded-card border border-border bg-surface-secondary p-4 flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <ShieldCheck size={13} /> Confirmation
          </span>

          {(!data.allContentComplete || (data.quizRequired && !data.quizPassed)) ? (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <Lock size={12} />
              {!data.allContentComplete
                ? 'Finish the content first.'
                : 'Pass the quiz first.'}
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={confirmed}
                       onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />
                <span>
                  I confirm I have read and understood
                  {data.targetTitle ? ` "${data.targetTitle}"` : ' this material'}, and that I will
                  follow it.
                </span>
              </label>
              <button
                disabled={!confirmed || attestMutation.isPending}
                onClick={() => attestMutation.mutate()}
                className="self-start px-3 py-1.5 text-xs font-medium rounded-ctl bg-brand-500 text-white disabled:opacity-60">
                {attestMutation.isPending ? 'Recording…' : 'Confirm'}
              </button>
              <p className="text-[10px] text-text-muted opacity-70">
                The date, time and your network address are recorded with this confirmation.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** One content item. Only VIDEO is watch-tracked; the rest are acknowledged. */
function ContentItem({ item, readOnly, onHeartbeat }) {
  const videoRef = useRef(null)
  const lastTimeRef = useRef(0)      // previous timeupdate position
  const playedRef   = useRef(0)      // seconds accumulated since the last post
  const lastPostRef = useRef(Date.now())

  /**
   * Accumulates real playback from timeupdate deltas rather than a timer.
   *
   * A forward jump larger than a couple of seconds is a seek, not playback, so
   * it contributes nothing — which is the same distinction the server draws
   * between maxPosition and watchedSeconds.
   */
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const now = v.currentTime
    const delta = now - lastTimeRef.current
    if (delta > 0 && delta < 2) playedRef.current += delta
    lastTimeRef.current = now

    if (Date.now() - lastPostRef.current >= HEARTBEAT_SECONDS * 1000) {
      const played = Math.floor(playedRef.current)
      // Carry the remainder instead of discarding it. Rounding to a whole
      // number and resetting to zero threw away up to a second per heartbeat,
      // and with six heartbeats in a one-minute video that alone cost several
      // seconds of genuine watching — enough to fail a 90% bar on a video
      // somebody had actually watched to the end.
      playedRef.current -= played
      lastPostRef.current = Date.now()
      if (played > 0) onHeartbeat(Math.floor(now), played)
    }
  }, [onHeartbeat])

  // Flush on pause and on unmount, so closing the tab does not lose the last
  // few seconds someone actually watched.
  const flush = useCallback(() => {
    const v = videoRef.current
    const played = Math.floor(playedRef.current)
    if (!v || played <= 0) return
    playedRef.current -= played
    lastPostRef.current = Date.now()
    onHeartbeat(Math.floor(v.currentTime), played)
  }, [onHeartbeat])

  useEffect(() => flush, [flush])

  /** Seeking forward past the furthest point reached snaps back. */
  const handleSeeking = useCallback(() => {
    const v = videoRef.current
    if (!v || readOnly) return
    const furthest = Math.max(item.maxPositionSeconds || 0, lastTimeRef.current)
    if (v.currentTime > furthest + 2) {
      v.currentTime = furthest
      toast('Skipping ahead is not counted — the training record has to mean something.',
            { icon: '⏮' })
    }
  }, [item.maxPositionSeconds, readOnly])

  if (item.itemType === 'VIDEO') {
    if (!item.playbackUrl) return (
      <p className="text-xs text-text-muted py-6 text-center">
        This video is not available. Its file may still be uploading.
      </p>
    )
    return (
      <div className="flex flex-col gap-2">
        {/* A FIXED 16:9 FRAME, the way YouTube does it.
            
            The previous version capped height and let width run to the
            container, so the element box was about 2.3:1 while the source is
            16:9 — the browser pillarboxed it and you got black bars down both
            sides.
            
            Constraining the WIDTH by the height budget instead gives a frame
            that is always exactly 16:9 and never taller than 60vh:
            60vh * 16/9 is the widest it can be before it would exceed that.
            These videos are 1920x1080, so they fill it with no bars at all.
            
            object-contain stays for the odd non-16:9 upload — that one gets
            letterboxed inside the frame rather than stretched, which is again
            what YouTube does. Content should never be distorted to fit. */}
        <div className="mx-auto w-full max-w-[calc(60vh*16/9)] aspect-video rounded-card bg-black overflow-hidden">
          <video
            ref={videoRef}
            // Keyed on the ITEM, never the URL. Even if a URL slips through
            // changing, React must not treat it as a different element and
            // remount it mid-playback.
            key={`item-${item.id}`}
            src={item.playbackUrl}
            controls
            controlsList="nodownload"
            onTimeUpdate={handleTimeUpdate}
            onSeeking={handleSeeking}
            onPause={flush}
            onEnded={flush}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>{item.title}</span>
          <span>
            {item.completed
              ? 'Watched'
              : `${formatDuration(item.watchedSeconds)} of ${formatDuration(item.durationSeconds)}`}
          </span>
        </div>
      </div>
    )
  }

  if (item.itemType === 'DOCUMENT') return (
    <a href={item.playbackUrl} target="_blank" rel="noreferrer"
       className="flex items-center gap-2 p-3 rounded-card border border-border hover:border-border-strong text-xs text-text-primary">
      <FileText size={14} /> {item.title}
    </a>
  )

  if (item.itemType === 'LINK') return (
    <a href={item.externalUrl} target="_blank" rel="noreferrer"
       className="flex items-center gap-2 p-3 rounded-card border border-border hover:border-border-strong text-xs text-text-primary">
      <ExternalLink size={14} /> {item.title}
    </a>
  )

  return (
    <div className="p-3 rounded-card border border-border bg-surface-secondary">
      <p className="text-xs font-medium text-text-primary mb-1">{item.title}</p>
      <p className="text-xs text-text-secondary whitespace-pre-wrap">{item.body}</p>
    </div>
  )
}

export default TrainingPlayerTab