import type { Season, Style } from './types'

export const SEASONS: readonly Season[] = ['Spring', 'Summer', 'Autumn', 'Winter']

export const DEFAULT_STYLES: readonly Style[] = [
  'Casual',
  'Streetwear',
  'Smart Casual',
  'Formal',
  'Elegant',
  'Sporty',
].map((name) => ({ id: `builtin-${name.toLowerCase().replace(/\s+/g, '-')}`, name, builtIn: true }))

export const OCCASIONS = ['Work', 'Weekend', 'Date', 'Party', 'Sport', 'Travel'] as const

export const COLOR_PALETTE = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Cream', hex: '#f3e9d2' },
  { name: 'Beige', hex: '#d6c3a5' },
  { name: 'Brown', hex: '#7a5134' },
  { name: 'Black', hex: '#111111' },
  { name: 'Grey', hex: '#8c8c8c' },
  { name: 'Navy', hex: '#1f2a44' },
  { name: 'Blue', hex: '#2f6fd1' },
  { name: 'Light Blue', hex: '#a7c8ec' },
  { name: 'Green', hex: '#3b7d4a' },
  { name: 'Olive', hex: '#6b6b2e' },
  { name: 'Yellow', hex: '#f2c94c' },
  { name: 'Orange', hex: '#e07a2f' },
  { name: 'Red', hex: '#c0392b' },
  { name: 'Pink', hex: '#efa1b8' },
  { name: 'Purple', hex: '#7b4fa0' },
] as const
