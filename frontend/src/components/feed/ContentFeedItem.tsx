import { type FeedItem } from '@/services/visual'
import PostContainer, { postSourceFromFeedItem } from '@/components/feed/PostContainer'

// ---------------------------------------------------------------------------
// Feed card — thin wrapper over PostContainer. The post source adapter owns
// the sizing, overlay state, editor + review dialogs; this file only maps a
// FeedItem into a PostSource so the feed keeps its existing import surface.
// ---------------------------------------------------------------------------

type Props = {
  item: FeedItem
  isActive: boolean
  index: number
}

export default function ContentFeedItem({ item, isActive }: Props) {
  return <PostContainer source={postSourceFromFeedItem(item)} isActive={isActive} />
}
