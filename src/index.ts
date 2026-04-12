import * as core from '@actions/core'
import { fetchGitHubAppCredentials } from './github-app.js'
import { fetchAIApiKeys } from './ai-keys.js'

async function run(): Promise<void> {
  await fetchGitHubAppCredentials()
  await fetchAIApiKeys()
}

run().catch(core.setFailed)
