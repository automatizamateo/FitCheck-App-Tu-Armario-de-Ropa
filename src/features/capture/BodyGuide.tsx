import type { View } from '../../domain/types'

// Simple full-body outlines (200×400 box) to frame the very first photo of each view.
const FRONT =
  'M88 66 Q100 72 112 66 L114 78 Q140 80 150 92 L168 190 Q170 200 162 202 L154 200 L140 118 L138 196 L134 250 L128 380 Q126 392 112 392 L106 392 L102 262 L98 262 L94 392 L88 392 Q74 392 72 380 L66 250 L62 196 L60 118 L46 200 L38 202 Q30 200 32 190 L50 92 Q60 80 86 78 Z'
const SIDE =
  'M92 66 L108 66 L110 80 Q124 86 124 110 L122 190 L116 250 L114 380 Q114 392 124 392 L128 396 L92 396 Q86 392 88 380 L84 250 L80 190 Q78 120 82 96 Q84 84 92 80 Z M96 94 Q90 140 94 198 L103 198 Q105 140 106 98 Z'

export function BodyGuide({ view }: { view: View }) {
  return (
    <svg viewBox="0 0 200 400" className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g fill="rgb(255 255 255 / 0.12)" stroke="white" strokeWidth="1.6" strokeDasharray="5 4" strokeLinejoin="round">
        <ellipse cx="100" cy="40" rx={view === 'side' ? 20 : 22} ry="27" />
        <path d={view === 'side' ? SIDE : FRONT} fillRule="evenodd" />
      </g>
    </svg>
  )
}
