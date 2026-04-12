import * as core from '@actions/core'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

const SECRET_ID = 'docker-agent-action/github-app'

interface GitHubAppSecret {
  app_id: string
  private_key: string
  org_membership_token: string
}

export async function fetchGitHubAppCredentials(): Promise<void> {
  const client = new SecretsManagerClient({ region: 'us-east-1' })

  let secretJson: string
  try {
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID }),
    )
    secretJson = res.SecretString ?? ''
  } catch (err) {
    // AWS not configured — non-docker repo, graceful no-op
    core.info(`AWS Secrets Manager unavailable, skipping ${SECRET_ID}: ${err}`)
    return
  }

  core.setSecret(secretJson)

  let secret: GitHubAppSecret
  try {
    secret = JSON.parse(secretJson) as GitHubAppSecret
  } catch {
    core.error(`${SECRET_ID} did not return valid JSON`)
    process.exit(1)
  }

  const { app_id, private_key, org_membership_token } = secret

  // Mask immediately after extraction
  core.setSecret(app_id)
  core.setSecret(private_key)
  core.setSecret(org_membership_token)

  // Validate
  for (const [field, value] of Object.entries({ app_id, private_key, org_membership_token })) {
    if (!value || value === 'null') {
      core.error(`Failed to extract ${field} from secret ${SECRET_ID}`)
      process.exit(1)
    }
  }

  // Export — core.exportVariable handles multi-line values automatically
  core.exportVariable('GITHUB_APP_ID', app_id)
  core.exportVariable('ORG_MEMBERSHIP_TOKEN', org_membership_token)
  core.exportVariable('GITHUB_APP_PRIVATE_KEY', private_key)
}
