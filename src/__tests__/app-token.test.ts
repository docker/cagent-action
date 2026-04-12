import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import { generateAppToken } from '../app-token.js'

vi.mock('@actions/core')
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(() => vi.fn().mockResolvedValue({ token: 'fake-token' })),
}))
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GITHUB_APP_ID
  delete process.env.GITHUB_APP_PRIVATE_KEY
  delete process.env.GITHUB_REPOSITORY
})

describe('generateAppToken', () => {
  it('returns early and logs info when credentials are not set', async () => {
    await generateAppToken()
    expect(core.exportVariable).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('not available'))
  })

  it('warns and continues when Octokit throws', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id'
    process.env.GITHUB_APP_PRIVATE_KEY = 'FAKE_PRIVATE_KEY_FOR_TESTING'
    process.env.GITHUB_REPOSITORY = 'docker/dagent'

    vi.mocked(Octokit).mockImplementation(() => {
      throw new Error('API error')
    })

    await generateAppToken()
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate'),
    )
    expect(core.exportVariable).not.toHaveBeenCalled()
  })
})
