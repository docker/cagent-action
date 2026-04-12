import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks (hoisted so vitest can rewrite imports) ────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSecret(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    app_id: 'app-123',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----',
    org_membership_token: 'ghs_orgtoken',
    ...overrides,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchGitHubAppCredentials', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Prevent actual process exit; throw so async functions reject instead of halting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (() => { throw new Error('process.exit called') }) as any,
    )
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('1. happy path — sets all three env vars and masks them', async () => {
    const secretJson = makeSecret()
    mockSend.mockResolvedValueOnce({ SecretString: secretJson })

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await fetchGitHubAppCredentials()

    // Should mask the raw JSON blob
    expect(mockCore.setSecret).toHaveBeenCalledWith(secretJson)
    // Should mask individual fields
    expect(mockCore.setSecret).toHaveBeenCalledWith('app-123')
    expect(mockCore.setSecret).toHaveBeenCalledWith('ghs_orgtoken')
    // Should export env vars
    expect(mockCore.exportVariable).toHaveBeenCalledWith('GITHUB_APP_ID', 'app-123')
    expect(mockCore.exportVariable).toHaveBeenCalledWith('ORG_MEMBERSHIP_TOKEN', 'ghs_orgtoken')
    expect(mockCore.exportVariable).toHaveBeenCalledWith(
      'GITHUB_APP_PRIVATE_KEY',
      expect.stringContaining('BEGIN RSA'),
    )
  })

  it('2. missing app_id — exits with error', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: makeSecret({ app_id: '' }) })

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('process.exit called')
    expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('app_id'))
  })

  it('3. missing private_key — exits with error', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: makeSecret({ private_key: '' }) })

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('process.exit called')
    expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('private_key'))
  })

  it('4. missing org_membership_token — exits with error', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: makeSecret({ org_membership_token: '' }),
    })

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('process.exit called')
    expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('org_membership_token'))
  })

  it('5. AWS unavailable — returns without error, logs info', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network unreachable'))

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await expect(fetchGitHubAppCredentials()).resolves.toBeUndefined()
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('AWS Secrets Manager unavailable'))
    expect(mockCore.exportVariable).not.toHaveBeenCalled()
  })

  it('6. invalid JSON — exits with error', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: 'not-json!!!' })

    const { fetchGitHubAppCredentials } = await import('../github-app.js')
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('process.exit called')
    expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('valid JSON'))
  })
})
