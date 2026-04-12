import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: vi.fn().mockImplementation((input) => input),
}))

const mockCore = {
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setSecret: vi.fn(),
  exportVariable: vi.fn(),
  setFailed: vi.fn(),
}

vi.mock('@actions/core', () => mockCore)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchAIApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. happy path — both keys set and masked', async () => {
    const secretJson = JSON.stringify({
      anthropic_api_key: 'sk-ant-abc123',
      openai_api_key: 'sk-openai-xyz789',
    })
    mockSend.mockResolvedValueOnce({ SecretString: secretJson })

    const { fetchAIApiKeys } = await import('../ai-keys.js')
    await fetchAIApiKeys()

    expect(mockCore.setSecret).toHaveBeenCalledWith(secretJson)
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-ant-abc123')
    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-openai-xyz789')
    expect(mockCore.exportVariable).toHaveBeenCalledWith('ANTHROPIC_API_KEY_FROM_SSM', 'sk-ant-abc123')
    expect(mockCore.exportVariable).toHaveBeenCalledWith('OPENAI_API_KEY_FROM_SSM', 'sk-openai-xyz789')
  })

  it('2. only anthropic_api_key present — only that one exported', async () => {
    const secretJson = JSON.stringify({ anthropic_api_key: 'sk-ant-only' })
    mockSend.mockResolvedValueOnce({ SecretString: secretJson })

    const { fetchAIApiKeys } = await import('../ai-keys.js')
    await fetchAIApiKeys()

    expect(mockCore.setSecret).toHaveBeenCalledWith('sk-ant-only')
    expect(mockCore.exportVariable).toHaveBeenCalledWith('ANTHROPIC_API_KEY_FROM_SSM', 'sk-ant-only')
    expect(mockCore.exportVariable).not.toHaveBeenCalledWith('OPENAI_API_KEY_FROM_SSM', expect.anything())
  })

  it('3. AWS unavailable — returns without error, logs warning', async () => {
    mockSend.mockRejectedValueOnce(new Error('Connection timeout'))

    const { fetchAIApiKeys } = await import('../ai-keys.js')
    await expect(fetchAIApiKeys()).resolves.toBeUndefined()
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('AWS Secrets Manager unavailable'),
    )
    expect(mockCore.exportVariable).not.toHaveBeenCalled()
  })

  it('4. invalid JSON — returns without error, logs warning', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: '{broken-json' })

    const { fetchAIApiKeys } = await import('../ai-keys.js')
    await expect(fetchAIApiKeys()).resolves.toBeUndefined()
    expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('valid JSON'))
    expect(mockCore.exportVariable).not.toHaveBeenCalled()
  })
})
