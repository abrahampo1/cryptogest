import { describe, it, expect, beforeEach } from 'vitest'

// Mock electron before importing
import { vi } from 'vitest'
vi.mock('electron', () => ({
  net: { request: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))

import {
  clearCloudApiConfig,
  __test__,
} from '../cloudApi'

const {
  getNextId,
  registerEntity,
  buildIdMapsFromEntities,
  getIdMap,
  getReverseIdMap,
  getCacheForType,
  setCacheForType,
  updateCacheEntity,
  removeCacheEntity,
  getUuidById,
  idCounters,
  resetState,
} = __test__

// ============================================
// ID Management
// ============================================

describe('ID Management', () => {
  beforeEach(() => {
    resetState()
  })

  describe('getNextId', () => {
    it('starts at 1 for new entity type', () => {
      expect(getNextId('test')).toBe(1)
    })

    it('increments sequentially', () => {
      expect(getNextId('test')).toBe(1)
      expect(getNextId('test')).toBe(2)
      expect(getNextId('test')).toBe(3)
    })

    it('maintains separate counters per entity type', () => {
      expect(getNextId('empleado')).toBe(1)
      expect(getNextId('departamento')).toBe(1)
      expect(getNextId('empleado')).toBe(2)
      expect(getNextId('departamento')).toBe(2)
    })

    it('respects counter set by registerEntity', () => {
      registerEntity('test', 50, 'uuid-50')
      expect(getNextId('test')).toBe(51)
    })
  })

  describe('registerEntity', () => {
    it('registers id to uuid mapping', () => {
      registerEntity('test', 1, 'uuid-1')
      expect(getIdMap('test').get(1)).toBe('uuid-1')
      expect(getReverseIdMap('test').get('uuid-1')).toBe(1)
    })

    it('updates counter to be above registered id', () => {
      registerEntity('test', 10, 'uuid-10')
      expect(idCounters.get('test')).toBe(11)
    })

    it('does not decrease counter', () => {
      registerEntity('test', 10, 'uuid-10')
      registerEntity('test', 3, 'uuid-3')
      expect(idCounters.get('test')).toBe(11)
    })

    it('handles registering same id with different uuid (overwrite)', () => {
      registerEntity('test', 1, 'uuid-a')
      registerEntity('test', 1, 'uuid-b')
      expect(getIdMap('test').get(1)).toBe('uuid-b')
      expect(getReverseIdMap('test').get('uuid-b')).toBe(1)
    })
  })

  describe('getUuidById', () => {
    it('returns uuid for registered entity', () => {
      registerEntity('test', 5, 'uuid-5')
      expect(getUuidById('test', 5)).toBe('uuid-5')
    })

    it('returns undefined for unregistered entity', () => {
      expect(getUuidById('test', 999)).toBeUndefined()
    })

    it('returns undefined for wrong entity type', () => {
      registerEntity('empleado', 1, 'uuid-1')
      expect(getUuidById('departamento', 1)).toBeUndefined()
    })
  })

  describe('buildIdMapsFromEntities', () => {
    it('builds maps from entity array', () => {
      const entities = [
        { id: 1, _uuid: 'uuid-1', nombre: 'A' },
        { id: 2, _uuid: 'uuid-2', nombre: 'B' },
        { id: 5, _uuid: 'uuid-5', nombre: 'C' },
      ]
      buildIdMapsFromEntities('test', entities)

      expect(getIdMap('test').get(1)).toBe('uuid-1')
      expect(getIdMap('test').get(2)).toBe('uuid-2')
      expect(getIdMap('test').get(5)).toBe('uuid-5')
      expect(getReverseIdMap('test').get('uuid-1')).toBe(1)
    })

    it('sets counter to max(id) + 1', () => {
      const entities = [
        { id: 3, _uuid: 'uuid-3' },
        { id: 7, _uuid: 'uuid-7' },
        { id: 5, _uuid: 'uuid-5' },
      ]
      buildIdMapsFromEntities('test', entities)
      expect(getNextId('test')).toBe(8)
    })

    it('preserves higher counter from previous state', () => {
      // Simulate: entity 20 was created locally, then server returns entities 1-10
      registerEntity('test', 20, 'uuid-20')
      // Counter is now 21

      const serverEntities = [
        { id: 1, _uuid: 'uuid-1' },
        { id: 2, _uuid: 'uuid-2' },
        { id: 10, _uuid: 'uuid-10' },
      ]
      buildIdMapsFromEntities('test', serverEntities)

      // Counter must be at least 21 (from previous state), not 11
      expect(getNextId('test')).toBe(21)
    })

    it('skips entities without id or _uuid', () => {
      const entities = [
        { id: 1, _uuid: 'uuid-1' },
        { nombre: 'no-id' },            // missing id
        { id: 3 },                       // missing _uuid
        { id: null, _uuid: 'uuid-n' },  // null id
        { id: 4, _uuid: 'uuid-4' },
      ]
      buildIdMapsFromEntities('test', entities)

      expect(getIdMap('test').size).toBe(2)
      expect(getIdMap('test').get(1)).toBe('uuid-1')
      expect(getIdMap('test').get(4)).toBe('uuid-4')
    })

    it('handles empty entity array', () => {
      registerEntity('test', 5, 'uuid-5')
      buildIdMapsFromEntities('test', [])
      // Counter preserved from previous state
      expect(getNextId('test')).toBe(6)
    })

    it('replaces old maps completely', () => {
      registerEntity('test', 1, 'uuid-old')
      buildIdMapsFromEntities('test', [
        { id: 1, _uuid: 'uuid-new' },
      ])
      expect(getIdMap('test').get(1)).toBe('uuid-new')
      expect(getReverseIdMap('test').get('uuid-old')).toBeUndefined()
    })

    it('no ID collision after rebuild and new create', () => {
      // Build from server entities
      buildIdMapsFromEntities('test', [
        { id: 1, _uuid: 'uuid-1' },
        { id: 2, _uuid: 'uuid-2' },
        { id: 3, _uuid: 'uuid-3' },
      ])
      // Next ID should not collide with existing
      const newId = getNextId('test')
      expect(newId).toBe(4)
      expect(getIdMap('test').has(newId)).toBe(false)
    })
  })
})

// ============================================
// Cache Management
// ============================================

describe('Cache Management', () => {
  beforeEach(() => {
    resetState()
  })

  describe('setCacheForType / getCacheForType', () => {
    it('sets and retrieves cache', () => {
      const entities = [{ id: 1, _uuid: 'u1', nombre: 'Test' }]
      setCacheForType('test', entities)
      const cache = getCacheForType('test')
      expect(cache).toBeDefined()
      expect(cache!.populated).toBe(true)
      expect(cache!.entities).toEqual(entities)
    })

    it('returns undefined for non-existent cache', () => {
      expect(getCacheForType('nonexistent')).toBeUndefined()
    })

    it('overwrites previous cache', () => {
      setCacheForType('test', [{ id: 1 }])
      setCacheForType('test', [{ id: 2 }, { id: 3 }])
      expect(getCacheForType('test')!.entities).toHaveLength(2)
    })
  })

  describe('updateCacheEntity', () => {
    it('updates existing entity by _uuid', () => {
      setCacheForType('test', [
        { id: 1, _uuid: 'u1', nombre: 'Old' },
        { id: 2, _uuid: 'u2', nombre: 'Keep' },
      ])
      updateCacheEntity('test', { id: 1, _uuid: 'u1', nombre: 'New' })

      const cache = getCacheForType('test')!
      expect(cache.entities[0].nombre).toBe('New')
      expect(cache.entities[1].nombre).toBe('Keep')
      expect(cache.entities).toHaveLength(2) // no duplicates
    })

    it('adds new entity when not found', () => {
      setCacheForType('test', [
        { id: 1, _uuid: 'u1', nombre: 'Existing' },
      ])
      updateCacheEntity('test', { id: 2, _uuid: 'u2', nombre: 'New' })

      const cache = getCacheForType('test')!
      expect(cache.entities).toHaveLength(2)
      expect(cache.entities[1].nombre).toBe('New')
    })

    it('does nothing when cache not populated', () => {
      // No cache set
      updateCacheEntity('test', { id: 1, _uuid: 'u1' })
      expect(getCacheForType('test')).toBeUndefined()
    })

    it('matches by id as fallback when _uuid does not match', () => {
      setCacheForType('test', [
        { id: 1, _uuid: 'old-uuid', nombre: 'Old' },
      ])
      // Same id, different uuid (e.g., after server rebuild)
      updateCacheEntity('test', { id: 1, _uuid: 'new-uuid', nombre: 'Updated' })

      const cache = getCacheForType('test')!
      expect(cache.entities).toHaveLength(1) // NO duplicate
      expect(cache.entities[0].nombre).toBe('Updated')
      expect(cache.entities[0]._uuid).toBe('new-uuid')
    })

    it('does not create duplicates on repeated updates', () => {
      setCacheForType('test', [])
      const entity = { id: 1, _uuid: 'u1', nombre: 'Test' }
      updateCacheEntity('test', entity)
      updateCacheEntity('test', { ...entity, nombre: 'Updated' })
      updateCacheEntity('test', { ...entity, nombre: 'Updated Again' })

      const cache = getCacheForType('test')!
      expect(cache.entities).toHaveLength(1)
      expect(cache.entities[0].nombre).toBe('Updated Again')
    })
  })

  describe('removeCacheEntity', () => {
    it('removes entity by uuid', () => {
      setCacheForType('test', [
        { id: 1, _uuid: 'u1' },
        { id: 2, _uuid: 'u2' },
        { id: 3, _uuid: 'u3' },
      ])
      removeCacheEntity('test', 'u2')

      const cache = getCacheForType('test')!
      expect(cache.entities).toHaveLength(2)
      expect(cache.entities.find((e: any) => e._uuid === 'u2')).toBeUndefined()
    })

    it('does nothing for non-existent uuid', () => {
      setCacheForType('test', [{ id: 1, _uuid: 'u1' }])
      removeCacheEntity('test', 'nonexistent')
      expect(getCacheForType('test')!.entities).toHaveLength(1)
    })

    it('does nothing when cache not populated', () => {
      removeCacheEntity('test', 'u1')
      // should not throw
    })
  })
})

// ============================================
// Integration: ID + Cache consistency
// ============================================

describe('ID and Cache Integration', () => {
  beforeEach(() => {
    resetState()
  })

  it('simulates create -> cache update -> rebuild from server', () => {
    // Step 1: First fetch populates cache
    const serverEntities = [
      { id: 1, _uuid: 'uuid-1', nombre: 'Existing' },
    ]
    buildIdMapsFromEntities('empleado', serverEntities)
    setCacheForType('empleado', [...serverEntities])

    // Step 2: Create new entity locally
    const newId = getNextId('empleado')
    expect(newId).toBe(2) // After existing id:1

    const newEntity = { id: newId, _uuid: 'uuid-new', nombre: 'New Employee' }
    registerEntity('empleado', newId, 'uuid-new')
    updateCacheEntity('empleado', newEntity)

    // Verify cache has both
    const cache = getCacheForType('empleado')!
    expect(cache.entities).toHaveLength(2)

    // Step 3: Server rebuild (simulating fetchAllEntitiesFromServer)
    // Server now has both entities
    const serverAfterCreate = [
      { id: 1, _uuid: 'uuid-1', nombre: 'Existing' },
      { id: 2, _uuid: 'uuid-new', nombre: 'New Employee' },
    ]
    buildIdMapsFromEntities('empleado', serverAfterCreate)
    setCacheForType('empleado', [...serverAfterCreate])

    // Verify no duplicates and IDs are correct
    const finalCache = getCacheForType('empleado')!
    expect(finalCache.entities).toHaveLength(2)
    expect(getNextId('empleado')).toBe(3)
  })

  it('simulates concurrent create during server rebuild', () => {
    // Initial state: server has entities 1-3
    buildIdMapsFromEntities('test', [
      { id: 1, _uuid: 'u1' },
      { id: 2, _uuid: 'u2' },
      { id: 3, _uuid: 'u3' },
    ])
    setCacheForType('test', [
      { id: 1, _uuid: 'u1' },
      { id: 2, _uuid: 'u2' },
      { id: 3, _uuid: 'u3' },
    ])

    // Create entity locally (id=4)
    const createId = getNextId('test')
    expect(createId).toBe(4)

    // Server rebuild happens (only has 1-3, not 4 yet)
    buildIdMapsFromEntities('test', [
      { id: 1, _uuid: 'u1' },
      { id: 2, _uuid: 'u2' },
      { id: 3, _uuid: 'u3' },
    ])

    // Register entity 4 after rebuild
    registerEntity('test', createId, 'u4')

    // Next id must not collide with 4
    const nextId = getNextId('test')
    expect(nextId).toBe(5)
    expect(getUuidById('test', 4)).toBe('u4')
  })

  it('multiple creates maintain unique IDs', () => {
    const ids = new Set<number>()
    for (let i = 0; i < 100; i++) {
      const id = getNextId('test')
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
    expect(ids.size).toBe(100)
  })

  it('rebuild does not lose locally created entities in cache', () => {
    // Initial cache
    setCacheForType('test', [
      { id: 1, _uuid: 'u1', nombre: 'Server' },
    ])
    buildIdMapsFromEntities('test', [{ id: 1, _uuid: 'u1' }])

    // Local create
    const newId = getNextId('test')
    const local = { id: newId, _uuid: 'u-local', nombre: 'Local' }
    registerEntity('test', newId, 'u-local')
    updateCacheEntity('test', local)

    expect(getCacheForType('test')!.entities).toHaveLength(2)

    // Simulate rebuild replacing cache with server data (which now has both)
    setCacheForType('test', [
      { id: 1, _uuid: 'u1', nombre: 'Server' },
      { id: 2, _uuid: 'u-local', nombre: 'Local' },
    ])
    buildIdMapsFromEntities('test', [
      { id: 1, _uuid: 'u1' },
      { id: 2, _uuid: 'u-local' },
    ])

    expect(getCacheForType('test')!.entities).toHaveLength(2)
    expect(getNextId('test')).toBe(3)
  })

  it('cache update after entity with id 0 works', () => {
    // id 0 is falsy but valid in some contexts
    setCacheForType('test', [])
    updateCacheEntity('test', { id: 0, _uuid: 'u0', nombre: 'Zero' })
    expect(getCacheForType('test')!.entities).toHaveLength(1)

    // Should match by _uuid, not create duplicate
    updateCacheEntity('test', { id: 0, _uuid: 'u0', nombre: 'Updated Zero' })
    expect(getCacheForType('test')!.entities).toHaveLength(1)
  })
})

// ============================================
// Stress: Rapid operations
// ============================================

describe('Stress Tests', () => {
  beforeEach(() => {
    resetState()
  })

  it('1000 sequential getNextId calls produce unique IDs', () => {
    const ids: number[] = []
    for (let i = 0; i < 1000; i++) {
      ids.push(getNextId('stress'))
    }
    const unique = new Set(ids)
    expect(unique.size).toBe(1000)
    expect(ids[0]).toBe(1)
    expect(ids[999]).toBe(1000)
  })

  it('rapid cache updates do not create duplicates', () => {
    setCacheForType('stress', [])
    for (let i = 1; i <= 100; i++) {
      updateCacheEntity('stress', { id: i, _uuid: `u${i}`, data: `v${i}` })
    }
    expect(getCacheForType('stress')!.entities).toHaveLength(100)

    // Update all of them
    for (let i = 1; i <= 100; i++) {
      updateCacheEntity('stress', { id: i, _uuid: `u${i}`, data: `updated-v${i}` })
    }
    expect(getCacheForType('stress')!.entities).toHaveLength(100) // still 100, no duplicates
  })

  it('interleaved builds and creates maintain consistency', () => {
    // Simulate multiple build/create cycles
    for (let cycle = 0; cycle < 10; cycle++) {
      const serverEntities = Array.from({ length: cycle * 3 }, (_, i) => ({
        id: i + 1,
        _uuid: `u-${i + 1}`,
      }))
      buildIdMapsFromEntities('test', serverEntities)
      setCacheForType('test', [...serverEntities])

      // Create 3 new entities
      for (let j = 0; j < 3; j++) {
        const id = getNextId('test')
        // ID must not collide with any existing
        expect(getIdMap('test').has(id)).toBe(false)
        registerEntity('test', id, `u-new-${cycle}-${j}`)
        updateCacheEntity('test', { id, _uuid: `u-new-${cycle}-${j}` })
      }
    }
  })
})
