import * as core from '@actions/core'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

const SECRET_ID = 'docker-agent-action/github-app'
const REGION = 'us-east-1'

interface GitHubAppSecret {
  app_id: string
  private_key: string
  org_membership_token: string
}

export async function fetchGitHubAppCredentials(
  credentials?: AwsCredentialIdentityProvider,
): Promise<void> {
  const client = new SecretsManagerClient({ region: REGION, credentials })

  let secretJson: string
  try {
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID }),
    )
    secretJson = res.SecretString ?? ''
  } catch (err) {
    core.info(`AWS Secrets Manager unavailable, skipping ${SECRET_ID}: ${err}`)
    return
  }

  core.setSecret(secretJson)

  let secret: GitHubAppSecret | undefined
  try {
    secret = JSON.parse(secretJson) as GitHubAppSecret
  } catch {
    core.error(`${SECRET_ID} did not return valid JSON`)
    process.exit(1)
  }

  if (!secret) return

  const { app_id, private_key, org_membership_token } = secret

  core.setSecret(app_id)
  core.setSecret(private_key)
  core.setSecret(org_membership_token)

  for (const [field, value] of Object.entries({
    app_id,
    private_key,
    org_membership_token,
  })) {
    if (!value || value === 'null') {
      core.error(`Failed to extract ${field} from secret ${SECRET_ID}`)
      process.exit(1)
      return
    }
  }

  core.exportVariable('GITHUB_APP_ID', app_id)
  core.exportVariable('ORG_MEMBERSHIP_TOKEN', org_membership_token)
  core.exportVariable('GITHUB_APP_PRIVATE_KEY', private_key)
}
