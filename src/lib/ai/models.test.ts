import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchProviderModels } from './models'
import { AI_PROVIDER_STATIC_MODELS } from './defaults'

describe('fetchProviderModels', () => {
  const globalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = globalFetch
  })

  it('returns static fallbacks when apiKey is missing or empty', async () => {
    const res = await fetchProviderModels({ provider: 'openai', apiKey: '' })
    expect(res.fetched).toBe(false)
    expect(res.models).toEqual(AI_PROVIDER_STATIC_MODELS.openai)
  })

  it('fetches OpenAI models via API when key is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-4o-mini' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' },
        ],
      }),
    } as unknown as Response)

    const res = await fetchProviderModels({ provider: 'openai', apiKey: 'sk-test-key' })
    expect(res.fetched).toBe(true)
    expect(res.models).toEqual([{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }])
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test-key' },
      })
    )
  })

  it('fetches Anthropic models via API when key is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet' },
          { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku' },
        ],
      }),
    } as unknown as Response)

    const res = await fetchProviderModels({ provider: 'anthropic', apiKey: 'sk-ant-test' })
    expect(res.fetched).toBe(true)
    expect(res.models).toEqual([
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ])
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: {
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
        },
      })
    )
  })

  it('fetches DeepSeek models via API when key is provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
      }),
    } as unknown as Response)

    const res = await fetchProviderModels({ provider: 'deepseek', apiKey: 'sk-ds-test' })
    expect(res.fetched).toBe(true)
    expect(res.models).toEqual([{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }])
  })

  it('falls back to static defaults if API request fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response)

    const res = await fetchProviderModels({ provider: 'openai', apiKey: 'sk-invalid' })
    expect(res.fetched).toBe(false)
    expect(res.models).toEqual(AI_PROVIDER_STATIC_MODELS.openai)
    expect(res.error).toContain('OpenAI returned status 401')
  })
})
