import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FEED_BATCH_SIZE,
  fetchContentFeed,
  type ContentFeedResponse,
  type FeedItem,
  type VisualBatchStatus,
} from '@/services/visual'

// ---------------------------------------------------------------------------
// Reels-style feed state: on-demand batched fetching, no polling.
//
//   1. First fetch loads exactly 5 posts (FEED_BATCH_SIZE); only it shows a skeleton.
//   2. When the reader is within 3 cards of the end of what is loaded,
//      fetch the next batch of 5 once (fetched-set guard).
//   3. Never double-fetch: one in-flight request per cursor + response cache
//      keyed by cursor, so re-renders and rapid skips are no-ops.
// ---------------------------------------------------------------------------

const START_KEY = 'start'

type Daily = { dailyLimit: number; preparedToday: number; remainingToday: number }

const EMPTY_DAILY: Daily = { dailyLimit: 0, preparedToday: 0, remainingToday: 0 }

export type ContentFeedState = {
  items: FeedItem[]
  /** True only until the first batch arrives — the one blocking load the feed allows. */
  bootstrapping: boolean
  /** True while a batch is being fetched that the reader has already reached (prefetch missed). */
  appending: boolean
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
  /** Reset the whole feed (company switch, refresh). */
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

  /** Fetch one batch by cursor. */
  const loadBatch = useCallback(
    async (cursorKey: string, cursor: string | null, mode: 'initial' | 'next') => {
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
        setChain((prev) => (prev.includes(cursorKey) ? prev : [...prev, cursorKey]))
        setError(null)
      } catch (e: any) {
        if (companyRef.current !== id) return
        // an aborted request is a navigation, not a failure
        if (e?.name === 'AbortError') return
        setError(e?.message ?? 'Could not load the feed.')
      } finally {
        inFlight.current.delete(cursorKey)
        if (mode === 'initial') setBootstrapping(false)
        if (mode === 'next') setAppending(false)
      }
    },
    [],
  )

  // first batch — the only load the reader ever waits for.
  // The fetched guard stops StrictMode remounts from loading `start` twice;
  // reset() clears it, so company switches and reload() still refetch.
  useEffect(() => {
    if (!companyId) return
    if (fetched.current.has(START_KEY)) return
    void loadBatch(START_KEY, null, 'initial')
  }, [companyId, nonce, loadBatch])

  // ponytail: server pages can still overlap across a snapshot expiry /
  // server restart (fresh shuffle beats a 400) — dedupe by content id so
  // React keys stay unique and posts are never duplicated/omitted.
  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: FeedItem[] = []
    for (const it of chain.flatMap((k) => batches[k]?.items ?? [])) {
      const id = it?.content?.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(it)
    }
    return out
  }, [chain, batches])
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
  // Prefetch — once the reader is within 3 cards of the end of what is
  // loaded, fetch the next batch of 5. `>=` (not `===`) so a fast skip that
  // jumps over the exact trigger index still fires, and a failed prefetch
  // retries naturally on the next advance (failures never join `fetched`).
  // The fetched-set guard in loadMore keeps every batch to one request.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!hasMore || dailyComplete) return
    if (items.length === 0) return
    if (appending) return
    if (activeIndex < items.length - 3) return
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[feed] prefetch', { activeIndex, loaded: items.length, nextCursor: nextCursor?.slice(0, 12) })
    }
    loadMore()
  }, [activeIndex, items.length, hasMore, dailyComplete, appending, loadMore, nextCursor])

  const retry = useCallback(() => {
    setError(null)
    if (!companyId) return
    // retry whichever batch failed: the next one if we have a cursor, else the first
    if (hasMore && nextCursor && !fetched.current.has(nextCursor)) {
      void loadBatch(nextCursor, nextCursor, 'next')
    } else {
      void loadBatch(START_KEY, null, 'initial')
    }
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
