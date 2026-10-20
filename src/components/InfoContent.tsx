import { PHOTO_TIPS } from '../content/info'

export function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3 text-[15px] leading-relaxed">
      {items.map((text) => (
        <li key={text} className="flex gap-3">
          <span className="bg-accent mt-2 size-1.5 shrink-0 rounded-full" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

export function PhotoTipsList() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PHOTO_TIPS.map((tip) => (
        <div key={tip.title} className="bg-surface border-line rounded-2xl border p-4">
          <p className="font-semibold">{tip.title}</p>
          <p className="text-muted mt-1 text-sm leading-snug">{tip.body}</p>
        </div>
      ))}
    </div>
  )
}
