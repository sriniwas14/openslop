import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FEED_BATCH_SIZE,
  fetchContentFeed,
  isVisualPending,
  type ContentFeedResponse,
  type FeedItem,
  type VisualBatchStatus,
} from '@/services/visual'

// ---------------------------------------------------------------------------
// Reels-style feed state: batched fetching, background prefetch and polling.
//
// Three rules drive this hook:
//   1. NEVER block the scroll. Only the very first batch shows a skeleton; every later
//      batch is prefetched ahead of the reader, and each post's visual fills in place.
//   2. NEVER issue 100 requests. The client asks for whole batches of 5 and walks an
//      opaque cursor chain — at most one request per batch.
//   3. NEVER double-fetch a batch. One in-flight request per cursor, and a response cache
//      keyed by cursor, so a repeated prefetch or a re-render is a no-op.
//
// Visuals are prepared server-side in the background, so a batch that is still `pending`
// is re-polled on the SAME cursor (idempotent — it never re-triggers work) until every
// post in it has resolved to matched / needs_review / failed.
// ---------------------------------------------------------------------------

const START_KEY = 'start'
/** How many posts before the end of what is loaded trigger the next batch (item 3 of 5). */
const PREFETCH_AHEAD = 3
/** Poll interval for batches whose visuals are still being prepared. */
const POLL_INTERVAL_MS = 2500

type Daily = { dailyLimit: number; preparedToday: number; remainingToday: number }

const EMPTY_DAILY: Daily = { dailyLimit: 0, preparedToday: 0, remainingToday: 0 }

export type ContentFeedState = {
  items: FeedItem[]
  /** True only until the first batch arrives — the one blocking load the feed allows. */
  bootstrapping: boolean
  /** True while a batch is being fetched that the reader has already reached (prefetch missed). */
  appending: boolean
  /** True while any loaded batch is still having its visuals prepared. */
  preparing: boolean
  error: string | null
  hasMore: boolean
  /** The daily preparation quota was consumed — no more visuals until tomorrow. */
  dailyComplete: boolean
  daily: Daily
  batchStatus: VisualBatchStatus | null
  activeIndex: number
  setActiveIndex: (i: number) => void
  /** Fetch the next batch now (also called automatically by the prefetch trigger). */
  loadMore: () => void
  /** Reset the whole feed (company switch, manual refresh). */
  reload: () => void
  /** Clear a terminal error and try the failed batch again. */
  retry: () => void
}

export function useContentFeed(companyId: string | null): ContentFeedState {
  // cursor chain in feed order + one cached response per cursor
  const [chain, setChain] = useState<string[]>([])
  const [batches, setBatches] = useState<Record<string, ContentFeedResponse>>({})
  const [bootstrapping, setBootstrapping] = useState(false)
  const [appending, setAppending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [nonce, setNonce] = useState(0) // bumped by reload()

  // mutable guards — refs so a re-render or a rapid scroll can never queue a duplicate
  const inFlight = useRef<Set<string>>(new Set())
  const fetched = useRef<Set<string>>(new Set())
  const companyRef = useRef<string | null>(companyId)
  companyRef.current = companyId

  const reset = useCallback(() => {
    inFlight.current.clear()
    fetched.current.clear()
    setChain([])
    setBatches({})
    setActiveIndex(0)
    setError(null)
    setAppending(false)
  }, [])

  // a company switch is a different feed entirely — drop every cached batch
  useEffect(() => {
    reset()
    setNonce((n) => n + 1)
  }, [companyId, reset])

  /** Fetch one batch by cursor. `poll` re-reads a batch already in the chain. */
  const loadBatch = useCallback(
    async (cursorKey: string, cursor: string | null, mode: 'initial' | 'next' | 'poll') => {
      const id = companyRef.current
      if (!id) return
      if (inFlight.current.has(cursorKey)) return // duplicate-prefetch guard
      inFlight.current.add(cursorKey)

      if (mode === 'initial') setBootstrapping(true)
      if (mode === 'next') setAppending(true)

      try {
        const res = await fetchContentFeed(id, { cursor, limit: FEED_BATCH_SIZE })
        if (companyRef.current !== id) return // the reader switched brands mid-flight
        fetched.current.add(cursorKey)
        setBatches((prev) => ({ ...prev, [cursorKey]: res }))
        if (mode !== 'poll') setChain((prev) => (prev.includes(cursorKey) ? prev : [...prev, cursorKey]))
        setError(null)
      } catch (e: any) {
        if (companyRef.current !== id) return
        // an aborted request is a navigation, not a failure
        if (e?.name === 'AbortError') return
        const msg = e?.message ?? 'Could not load the feed.'
        // a failed poll is silent — the next tick retries and the reader keeps scrolling
        if (mode !== 'poll') setError(msg)
      } finally {
        inFlight.current.delete(cursorKey)
        if (mode === 'initial') setBootstrapping(false)
        if (mode === 'next') setAppending(false)
      }
    },
    [],
  )

  // first batch — the only load the reader ever waits for
  useEffect(() => {
    if (!companyId) return
    void loadBatch(START_KEY, null, 'initial')
  }, [companyId, nonce, loadBatch])

  const items = useMemo(() => chain.flatMap((k) => batches[k]?.items ?? []), [chain, batches])
  const lastKey = chain.length ? chain[chain.length - 1] : null
  const lastBatch = lastKey ? batches[lastKey] : null
  const hasMore = !!lastBatch?.hasMore
  const daily = lastBatch
    ? { dailyLimit: lastBatch.dailyLimit, preparedToday: lastBatch.preparedToday, remainingToday: lastBatch.remainingToday }
    : EMPTY_DAILY
  const dailyComplete = daily.dailyLimit > 0 && daily.preparedToday >= daily.dailyLimit

  /** The cursor the next batch should be fetched with. */
  const nextCursor = lastBatch?.nextCursor ?? null

  const loadMore = useCallback(() => {
    if (!companyId || !hasMore || !nextCursor) return
    if (fetched.current.has(nextCursor)) return // already loaded — nothing to do
    void loadBatch(nextCursor, nextCursor, 'next')
  }, [companyId, hasMore, nextCursor, loadBatch])

  // -------------------------------------------------------------------------
  // Background prefetch — start the next batch while the reader is still 3 posts
  // from the end of what is loaded, so it is ready before they arrive.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!hasMore || dailyComplete) return
    if (items.length === 0) return
    if (activeIndex < items.length - PREFETCH_AHEAD) return
    loadMore()
  }, [activeIndex, items.length, hasMore, dailyComplete, loadMore])

  // -------------------------------------------------------------------------
  // Polling — a loaded batch whose visuals are still being prepared is re-read on
  // the same cursor until every post resolves. Runs only while something is pending,
  // never touches the scroll position, and stops on its own.
  // -------------------------------------------------------------------------
  const pendingKeys = useMemo(
    () => chain.filter((k) => (batches[k]?.items ?? []).some((it) => isVisualPending(it.visualStatus))),
    [chain, batches],
  )
  const preparing = pendingKeys.length > 0

  useEffect(() => {
    if (!companyId || pendingKeys.length === 0) return
    let cancelled = false
    const timer = setInterval(() => {
      if (cancelled) return
      for (const key of pendingKeys) {
        // the cursor stored on the batch that PRECEDES this one produced it; re-request
        // with this batch's own key so the server returns the same page (idempotent)
        const cursor = key === START_KEY ? null : key
        void loadBatch(key, cursor, 'poll')
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [companyId, pendingKeys.join('|'), loadBatch])

  const retry = useCallback(() => {
    setError(null)
    if (!companyId) return
    // retry whichever batch failed: the next one if we have a cursor, else the first
    if (hasMore && nextCursor && !fetched.current.has(nextCursor)) void loadBatch(nextCursor, nextCursor, 'next')
    else void loadBatch(START_KEY, null, 'initial')
  }, [companyId, hasMore, nextCursor, loadBatch])

  const reload = useCallback(() => {
    reset()
    setNonce((n) => n + 1)
  }, [reset])

  const batchStatus: VisualBatchStatus | null = lastBatch?.batch?.status ?? null

  return {
    items,
    bootstrapping,
    appending,
    preparing,
    error,
    hasMore,
    dailyComplete,
    daily,
    batchStatus,
    activeIndex,
    setActiveIndex,
    loadMore,
    reload,
    retry,
  }
}
