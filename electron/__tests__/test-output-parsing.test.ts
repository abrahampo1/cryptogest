import { describe, it, expect } from 'vitest'

/**
 * Tests for the vitest output parsing logic used in main.ts testing:run handler.
 * These verify that test result symbols are correctly detected with and without ANSI codes.
 */

const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '')

const PASS_REGEX = /^\s*[✓✔√]\s/
const FAIL_REGEX = /^\s*[✗✘×]\s/
const SKIP_REGEX = /^\s*[-⊘○]\s/

describe('Test output parsing', () => {
  describe('stripAnsi', () => {
    it('strips color codes', () => {
      expect(stripAnsi('\x1b[32m✓\x1b[39m test name')).toBe('✓ test name')
    })

    it('strips multiple ANSI sequences', () => {
      expect(stripAnsi('\x1b[1m\x1b[46m RUN \x1b[49m\x1b[22m \x1b[36mv4.0.18\x1b[39m')).toBe(' RUN  v4.0.18')
    })

    it('returns plain text unchanged', () => {
      expect(stripAnsi('plain text')).toBe('plain text')
    })

    it('handles empty string', () => {
      expect(stripAnsi('')).toBe('')
    })

    it('strips semicolon-separated codes', () => {
      expect(stripAnsi('\x1b[1;32mBold Green\x1b[0m')).toBe('Bold Green')
    })
  })

  describe('pass symbol detection', () => {
    it('matches clean ✓', () => {
      expect(PASS_REGEX.test(' ✓ test name')).toBe(true)
    })

    it('matches clean √', () => {
      expect(PASS_REGEX.test(' √ test name')).toBe(true)
    })

    it('matches clean ✔', () => {
      expect(PASS_REGEX.test(' ✔ test name')).toBe(true)
    })

    it('does NOT match ✓ wrapped in ANSI without stripping', () => {
      const line = ' \x1b[32m✓\x1b[39m test name'
      expect(PASS_REGEX.test(line)).toBe(false)
    })

    it('matches ✓ after stripping ANSI', () => {
      const line = ' \x1b[32m✓\x1b[39m test name'
      expect(PASS_REGEX.test(stripAnsi(line))).toBe(true)
    })

    it('matches real vitest verbose output after stripping', () => {
      const realLine = ' \x1b[32m✓\x1b[39m electron/__tests__/cloudApi.test.ts\x1b[2m > \x1b[22mCloudApiError\x1b[2m > \x1b[22mcreates an error\x1b[32m 1\x1b[2mms\x1b[22m\x1b[39m'
      expect(PASS_REGEX.test(stripAnsi(realLine))).toBe(true)
    })
  })

  describe('fail symbol detection', () => {
    it('matches clean ×', () => {
      expect(FAIL_REGEX.test(' × test name')).toBe(true)
    })

    it('matches clean ✗', () => {
      expect(FAIL_REGEX.test(' ✗ test name')).toBe(true)
    })

    it('matches clean ✘', () => {
      expect(FAIL_REGEX.test(' ✘ test name')).toBe(true)
    })

    it('does NOT match × wrapped in ANSI without stripping', () => {
      const line = ' \x1b[31m×\x1b[39m test name'
      expect(FAIL_REGEX.test(line)).toBe(false)
    })

    it('matches × after stripping ANSI', () => {
      const line = ' \x1b[31m×\x1b[39m test name'
      expect(FAIL_REGEX.test(stripAnsi(line))).toBe(true)
    })
  })

  describe('skip symbol detection', () => {
    it('matches clean -', () => {
      expect(SKIP_REGEX.test(' - test name')).toBe(true)
    })

    it('matches clean ⊘', () => {
      expect(SKIP_REGEX.test(' ⊘ test name')).toBe(true)
    })

    it('matches clean ○', () => {
      expect(SKIP_REGEX.test(' ○ test name')).toBe(true)
    })
  })

  describe('duration parsing', () => {
    // Use the same regex as main.ts
    const DURATION_REGEX = /Duration\s+([\d.]+\s*(?:ms|s|m))/i

    it('parses duration from clean output', () => {
      const line = '   Duration  5.26s (transform 2.08s, setup 0ms)'
      const match = line.match(DURATION_REGEX)
      expect(match).toBeTruthy()
      expect(match![1]).toBe('5.26s')
    })

    it('parses duration after stripping ANSI', () => {
      const line = '\x1b[2m   Duration \x1b[22m 5.26s\x1b[2m (transform 2.08s)\x1b[22m'
      const clean = stripAnsi(line)
      const match = clean.match(DURATION_REGEX)
      expect(match).toBeTruthy()
      expect(match![1]).toBe('5.26s')
    })

    it('parses ms duration', () => {
      const line = '   Duration  718ms (transform 160ms)'
      const match = line.match(DURATION_REGEX)
      expect(match).toBeTruthy()
      expect(match![1]).toBe('718ms')
    })

    it('does not capture 0ms from setup in the Duration line', () => {
      const line = '   Duration  5.32s (transform 1.99s, setup 0ms, import 3.01s)'
      const match = line.match(DURATION_REGEX)
      expect(match).toBeTruthy()
      expect(match![1]).toBe('5.32s')
      expect(match![1]).not.toBe('0ms')
    })

    it('parses from combined stdout+stderr output', () => {
      const output = [
        ' ✓ test1 1ms',
        ' ✓ test2 0ms',
        ' Test Files  1 passed (1)',
        '      Tests  2 passed (2)',
        '   Duration  3.50s (transform 0.5s, setup 0ms)',
      ].join('\n')
      const match = output.match(DURATION_REGEX)
      expect(match).toBeTruthy()
      expect(match![1]).toBe('3.50s')
    })
  })

  describe('summary count parsing (fallback)', () => {
    it('parses passed count from summary', () => {
      const output = '      Tests  383 passed (383)\n   Start at  02:37:39'
      const match = output.match(/(\d+)\s+passed/i)
      expect(match).toBeTruthy()
      expect(parseInt(match![1], 10)).toBe(383)
    })

    it('parses failed count from summary', () => {
      const output = '      Tests  2 failed | 381 passed (383)'
      const failMatch = output.match(/(\d+)\s+failed/i)
      const passMatch = output.match(/(\d+)\s+passed/i)
      expect(failMatch).toBeTruthy()
      expect(parseInt(failMatch![1], 10)).toBe(2)
      expect(passMatch).toBeTruthy()
      expect(parseInt(passMatch![1], 10)).toBe(381)
    })

    it('parses from ANSI-stripped output', () => {
      const raw = '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m382 passed\x1b[39m\x1b[22m\x1b[90m (383)\x1b[39m'
      const clean = stripAnsi(raw)
      const failMatch = clean.match(/(\d+)\s+failed/i)
      const passMatch = clean.match(/(\d+)\s+passed/i)
      expect(parseInt(failMatch![1], 10)).toBe(1)
      expect(parseInt(passMatch![1], 10)).toBe(382)
    })
  })

  describe('counting simulation', () => {
    it('correctly counts pass/fail/skip from real vitest output', () => {
      const lines = [
        ' \x1b[32m✓\x1b[39m test1\x1b[32m 1\x1b[2mms\x1b[22m\x1b[39m',
        ' \x1b[32m✓\x1b[39m test2\x1b[32m 0\x1b[2mms\x1b[22m\x1b[39m',
        ' \x1b[31m×\x1b[39m test3\x1b[32m 2\x1b[2mms\x1b[22m\x1b[39m',
        ' \x1b[32m✓\x1b[39m test4\x1b[32m 0\x1b[2mms\x1b[22m\x1b[39m',
        '',
        '\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m1 passed\x1b[39m\x1b[22m',
        '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m | \x1b[1m\x1b[32m3 passed\x1b[39m\x1b[22m',
      ]

      let pass = 0, fail = 0, skip = 0
      for (const line of lines) {
        const clean = stripAnsi(line)
        if (PASS_REGEX.test(clean)) pass++
        else if (FAIL_REGEX.test(clean)) fail++
        else if (SKIP_REGEX.test(clean)) skip++
      }

      expect(pass).toBe(3)
      expect(fail).toBe(1)
      expect(skip).toBe(0)
    })

    it('fallback to summary counts when line-by-line misses (ANSI not stripped)', () => {
      // Simulate the old bug: line-by-line counting fails on ANSI
      const lines = [
        ' \x1b[32m✓\x1b[39m test1',
        ' \x1b[32m✓\x1b[39m test2',
        ' \x1b[31m×\x1b[39m test3',
      ]

      // Without strip: counts would be 0
      let rawPass = 0, rawFail = 0
      for (const line of lines) {
        if (PASS_REGEX.test(line)) rawPass++
        else if (FAIL_REGEX.test(line)) rawFail++
      }
      expect(rawPass).toBe(0) // Bug: ANSI breaks regex
      expect(rawFail).toBe(0)

      // Fallback: parse summary from combined output
      const fullOutput = stripAnsi(lines.join('\n') + '\n      Tests  1 failed | 2 passed (3)')
      const passMatch = fullOutput.match(/(\d+)\s+passed/i)
      const failMatch = fullOutput.match(/(\d+)\s+failed/i)
      const finalPassed = rawPass || (passMatch ? parseInt(passMatch[1], 10) : 0)
      const finalFailed = rawFail || (failMatch ? parseInt(failMatch[1], 10) : 0)

      expect(finalPassed).toBe(2)
      expect(finalFailed).toBe(1)
    })
  })
})
