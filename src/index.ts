import * as core from '@actions/core'
import { getAWSCredentials } from './aws-credentials.js'
import { fetchGitHubAppCredentials } from './github-app.js'
import { fetchAIApiKeys } from './ai-keys.js'
import { generateAppToken } from './app-token.js'

async function run(): Promise<void> {
  const credentials = await getAWSCredentials()
  await fetchGitHubAppCredentials(credentials)
  await fetchAIApiKeys(credentials)
  await generateAppToken()
}

run().catch(core.setFailed)
