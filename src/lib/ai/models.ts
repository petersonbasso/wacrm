import type { AiProvider } from './types'
import { AI_PROVIDER_STATIC_MODELS, type ProviderModelOption } from './defaults'

export interface FetchModelsResult {
  models: ProviderModelOption[]
  fetched: boolean
  error?: string
}

const REQUEST_TIMEOUT_MS = 8_000

export async function fetchProviderModels(args: {
  provider: AiProvider
  apiKey?: string | null
}): Promise<FetchModelsResult> {
  const { provider, apiKey } = args
  const fallbacks = AI_PROVIDER_STATIC_MODELS[provider] ?? []

  if (!apiKey || !apiKey.trim()) {
    return { models: fallbacks, fetched: false }
  }

  const key = apiKey.trim()

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        return { models: fallbacks, fetched: false, error: `OpenAI returned status ${res.status}` }
      }
      const json = await res.json().catch(() => null)
      const data = Array.isArray(json?.data) ? json.data : []
      
      const filtered = data
        .map((item: { id?: string }) => (typeof item?.id === 'string' ? item.id : ''))
        .filter((id: string) => {
          if (!id) return false
          const lower = id.toLowerCase()
          // Exclude non-chat models
          if (
            lower.includes('embedding') ||
            lower.includes('tts') ||
            lower.includes('whisper') ||
            lower.includes('dall-e') ||
            lower.includes('babbage') ||
            lower.includes('davinci') ||
            lower.includes('realtime') ||
            lower.includes('audio') ||
            lower.includes('transcription')
          ) {
            return false
          }
          return (
            lower.startsWith('gpt-') ||
            lower.startsWith('o1') ||
            lower.startsWith('o3') ||
            lower.startsWith('chatgpt') ||
            lower.startsWith('ft:')
          )
        })

      if (filtered.length === 0) {
        return { models: fallbacks, fetched: false }
      }

      // De-duplicate and sort
      const unique: string[] = Array.from(new Set(filtered))
      const models: ProviderModelOption[] = unique.map((id) => ({ id }))

      return { models, fetched: true }
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        return { models: fallbacks, fetched: false, error: `Anthropic returned status ${res.status}` }
      }
      const json = await res.json().catch(() => null)
      const data = Array.isArray(json?.data) ? json.data : []

      const models: ProviderModelOption[] = data
        .filter((item: { id?: string }) => typeof item?.id === 'string' && item.id.trim())
        .map((item: { id: string; display_name?: string }) => ({
          id: item.id,
          name: item.display_name ?? item.id,
        }))

      if (models.length === 0) {
        return { models: fallbacks, fetched: false }
      }

      return { models, fetched: true }
    }

    if (provider === 'deepseek') {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        return { models: fallbacks, fetched: false, error: `DeepSeek returned status ${res.status}` }
      }
      const json = await res.json().catch(() => null)
      const data = Array.isArray(json?.data) ? json.data : []

      const models: ProviderModelOption[] = data
        .filter((item: { id?: string }) => typeof item?.id === 'string' && item.id.trim())
        .map((item: { id: string }) => ({ id: item.id }))

      if (models.length === 0) {
        return { models: fallbacks, fetched: false }
      }

      return { models, fetched: true }
    }

    return { models: fallbacks, fetched: false }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Network error'
    return { models: fallbacks, fetched: false, error: errorMsg }
  }
}
