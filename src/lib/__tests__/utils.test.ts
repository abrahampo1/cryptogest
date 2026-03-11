import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (className utility)', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('merges conflicting tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles arrays of class names', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
  })

  it('handles undefined and null gracefully', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('handles objects (clsx style)', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
  })

  it('merges tailwind conflicting utilities correctly', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
    expect(cn('mt-2', 'mt-4')).toBe('mt-4')
  })
})
