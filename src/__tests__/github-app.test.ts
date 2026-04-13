import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as core from '@actions/core'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { fetchGitHubAppCredentials } from '../github-app.js'

vi.mock('@actions/core')
vi.mock('@aws-sdk/client-secrets-manager')

const mockSend = vi.fn()
vi.mocked(SecretsManagerClient).mockImplementation(
  () => ({ send: mockSend }) as unknown as SecretsManagerClient,
)

const VALID_SECRET = JSON.stringify({
  app_id: 'test-app-id',
  private_key: 'FAKE_PRIVATE_KEY_FOR_TESTING',
  org_membership_token: 'test-org-token',
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
})

describe('fetchGitHubAppCredentials', () => {
  it('sets env vars and masks fields on valid secret', async () => {
    mockSend.mockResolvedValue({ SecretString: VALID_SECRET })
    await fetchGitHubAppCredentials()
    expect(core.exportVariable).toHaveBeenCalledWith('GITHUB_APP_ID', 'test-app-id')
    expect(core.exportVariable).toHaveBeenCalledWith('ORG_MEMBERSHIP_TOKEN', 'test-org-token')
    expect(core.exportVariable).toHaveBeenCalledWith('GITHUB_APP_PRIVATE_KEY', 'FAKE_PRIVATE_KEY_FOR_TESTING')
    expect(core.setSecret).toHaveBeenCalledWith(expect.stringContaining('FAKE_PRIVATE_KEY_FOR_TESTING'))
  })

  it('exits with error when app_id is missing', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ app_id: '', private_key: 'key', org_membership_token: 'tok' }),
    })
    await fetchGitHubAppCredentials()
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits with error when private_key is missing', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ app_id: 'id', private_key: '', org_membership_token: 'tok' }),
    })
    await fetchGitHubAppCredentials()
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits with error on invalid JSON', async () => {
    mockSend.mockResolvedValue({ SecretString: 'not-json' })
    await fetchGitHubAppCredentials()
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('returns gracefully when AWS is unavailable', async () => {
    mockSend.mockRejectedValue(new Error('network error'))
    await expect(fetchGitHubAppCredentials()).resolves.toBeUndefined()
    expect(core.exportVariable).not.toHaveBeenCalled()
  })

  it('accepts an explicit credentials provider', async () => {
    mockSend.mockResolvedValue({ SecretString: VALID_SECRET })
    const fakeCredentials = vi.fn()
    await fetchGitHubAppCredentials(fakeCredentials as never)
    expect(core.exportVariable).toHaveBeenCalledWith('GITHUB_APP_ID', 'test-app-id')
  })
})
