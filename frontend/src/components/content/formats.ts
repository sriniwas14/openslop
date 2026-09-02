import type { ContentType } from './data'

export type ContentFormat = {
  id: string
  title: string
  description: string
  /** card preview image — null renders the upload placeholder */
  image: string | null
  type: 'standard' | 'custom'
  /** backend pipeline kind when this format is supported by the generation flow */
  kind: ContentType | null
}

// ponytail: order matches the reference panel — slideshow selected by default
export const CONTENT_FORMATS: ContentFormat[] = [
  { id: 'slideshow', title: 'Slideshow', description: 'Multi-image carousel with captions', image: '/formats/slideshow.png', type: 'standard', kind: 'carousel' },
  { id: 'wall-of-text', title: 'Wall of Text', description: 'Bold text on a plain background', image: '/formats/walloftext.png', type: 'standard', kind: null },
  { id: 'video-hook-demo', title: 'Video Hook & Demo', description: 'Hook clip + app demo stitched together', image: '/formats/videohookdemo.png', type: 'standard', kind: null },
  { id: 'speaking-hook-demo', title: 'Speaking Hook & Demo', description: 'Someone says the hook out loud, then your demo', image: '/formats/speakinghookdemo.png', type: 'standard', kind: null },
  { id: 'talking-head-ugc', title: 'Talking Head UGC', description: 'AI avatar speaks a script to camera', image: '/formats/talkingheadugc.png', type: 'standard', kind: 'talkinghead' },
  { id: 'green-screen-meme', title: 'Green Screen Meme', description: 'Trending video with your background image', image: '/formats/greenscreenmeme.png', type: 'standard', kind: 'greenscreen' },
  { id: 'talking-head-green-screen', title: 'Talking Head Green Screen', description: 'AI avatar composited into the corner of a demo video', image: '/formats/talkingheadgreenscreen.png', type: 'standard', kind: 'greenscreen' },
  { id: 'product-spokesperson', title: 'Product Spokesperson', description: 'A character holds your product and talks about it', image: '/formats/productspokesperson.png', type: 'standard', kind: 'talkinghead' },
  { id: 'green-screen-mobile', title: 'Green Screen Mobile with App', description: 'A presenter holding a phone with your app on screen', image: '/formats/greenscreenmobile.png', type: 'standard', kind: 'greenscreen' },
  { id: 'claymation', title: 'Claymation', description: 'Stop-motion clay ad with narration and captions', image: '/formats/claymation.png', type: 'standard', kind: null },
  { id: 'character-swap', title: 'Character Swap', description: 'Swap the character in a video using AI', image: '/formats/characterswap.png', type: 'standard', kind: null },
  { id: 'custom', title: 'Custom', description: 'Upload your own video or image', image: null, type: 'custom', kind: null },
]
