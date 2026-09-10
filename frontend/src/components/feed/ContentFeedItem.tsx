import { type FeedItem } from '@/services/visual'
import PostContainer, { postSourceFromFeedItem, type PostReviewSnapshot } from '@/components/feed/PostContainer'

// ---------------------------------------------------------------------------
// Feed card — thin wrapper over PostContainer. The post source adapter owns
// the sizing, overlay state, editor + review dialogs; this file only maps a
// FeedItem into a PostSource so the feed keeps its existing import surface.
// ---------------------------------------------------------------------------

type Props = {
  item: FeedItem
  isActive: boolean
  index: number
  onSkip?: () => void
  onReviewPress?: (snapshot: PostReviewSnapshot) => void
  reviewActionRef?: { current: (() => void) | null }
  soundOn?: boolean
  onToggleSound?: () => void
  /** Peek rendering behind the active card — media only, no action buttons. */
  showActions?: boolean
  /** Peek rendering — hide the top stickers so they never double behind the
   *  active card's sticker row. */
  showPills?: boolean
}

export default function ContentFeedItem({
  item,
  isActive,
  onSkip,
  onReviewPress,
  reviewActionRef,
  showActions,
  showPills,
  soundOn,
  onToggleSound,
}: Props) {
  return (
    <PostContainer
      source={postSourceFromFeedItem(item)}
      isActive={isActive}
      memeActive={isActive}
      onSkip={onSkip}
      onReviewPress={onReviewPress}
      reviewActionRef={reviewActionRef}
      showActions={showActions}
      showPills={showPills}
      soundOn={soundOn}
      onToggleSound={onToggleSound}
    />
  )
}
