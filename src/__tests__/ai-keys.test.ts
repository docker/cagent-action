import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as core from '@actions/core'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { fetchAIApiKeys } from '../ai-keys.js'

vi.mock('@actions/core')
vi.mock('@aws-sdk/client-secrets-manager')

const mockSend = vi.fn()
vi.mocked(SecretsManagerClient).mockImplementation(
  () => ({ send: mockSend }) as unknown as SecretsManagerClient,
)

beforeEach(() => vi.clearAllMocks())

describe('fetchAIApiKeys', () => {
  it('exports both keys when both are present', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        anthropic_api_key: 'ant-key',
        openai_api_key: 'oai-key',
      }),
    })
    await fetchAIApiKeys()
    expect(core.exportVariable).toHaveBeenCalledWith('ANTHROPIC_API_KEY_FROM_SSM', 'ant-key')
    expect(core.exportVariable).toHaveBeenCalledWith('OPENAI_API_KEY_FROM_SSM', 'oai-key')
  })

  it('exports only anthropic when openai is absent', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ anthropic_api_key: 'ant-key' }),
    })
    await fetchAIApiKeys()
    expect(core.exportVariable).toHaveBeenCalledWith('ANTHROPIC_API_KEY_FROM_SSM', 'ant-key')
    expect(core.exportVariable).not.toHaveBeenCalledWith('OPENAI_API_KEY_FROM_SSM', expect.anything())
  })

  it('warns and returns gracefully when AWS is unavailable', async () => {
    mockSend.mockRejectedValue(new Error('network error'))
    await expect(fetchAIApiKeys()).resolves.toBeUndefined()
    expect(core.exportVariable).not.toHaveBeenCalled()
  })

  it('warns and returns gracefully on invalid JSON', async () => {
    mockSend.mockResolvedValue({ SecretString: 'not-json' })
    await expect(fetchAIApiKeys()).resolves.toBeUndefined()
    expect(core.warning).toHaveBeenCalled()
    expect(core.exportVariable).not.toHaveBeenCalled()
  })
})
