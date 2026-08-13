import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import { fetchProviderModels } from '@/lib/ai/models'
import type { AiProvider } from '@/lib/ai/types'

/**
 * POST /api/ai/models (admin+)
 *
 * Query available models for a provider using the candidate API key
 * passed in body, or falling back to the saved API key for the account.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-models:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const provider = body.provider as AiProvider
    if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'deepseek') {
      return NextResponse.json(
        { error: 'provider must be "openai", "anthropic" or "deepseek"' },
        { status: 400 },
      )
    }

    const rawKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    let apiKeyPlain = rawKey

    if (!apiKeyPlain) {
      const { data: existing } = await supabase
        .from('ai_configs')
        .select('provider, api_key')
        .eq('account_id', accountId)
        .maybeSingle()

      if (existing?.api_key && existing.provider === provider) {
        try {
          apiKeyPlain = decrypt(existing.api_key)
        } catch {
          // Decryption failure falls through to static models
        }
      }
    }

    const result = await fetchProviderModels({
      provider,
      apiKey: apiKeyPlain,
    })

    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
