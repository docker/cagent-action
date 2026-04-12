import * as core from '@actions/core'
import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

export async function generateAppToken(): Promise<void> {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY

  if (!appId || !privateKey) {
    core.info('GitHub App credentials not available, skipping token generation')
    return
  }

  try {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId, privateKey },
    })

    const [owner] = (process.env.GITHUB_REPOSITORY ?? '').split('/')

    // Try org installation, fall back to user installation
    let installationId: number
    try {
      const { data } = await appOctokit.apps.getOrgInstallation({ org: owner })
      installationId = data.id
    } catch {
      const { data } = await appOctokit.apps.getUserInstallation({
        username: owner,
      })
      installationId = data.id
    }

    const auth = createAppAuth({ appId, privateKey })
    const { token } = await auth({ type: 'installation', installationId })

    core.setSecret(token)
    core.exportVariable('GITHUB_APP_TOKEN', token)
  } catch (err) {
    core.warning(`Failed to generate GitHub App token: ${err}`)
  }
}
