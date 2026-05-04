#!/usr/bin/env bash
# act-local.sh — Run GitHub Actions workflows locally with `act`.
#
# Fetches credentials from 1Password, generates a GITHUB_APP_TOKEN, and
# writes a temporary env file so act can skip the OIDC-based setup-credentials
# action (which does not work outside GitHub Actions).
#
# Usage examples:
#   # Run unit tests
#   ./scripts/act-local.sh push -j test
#
#   # Dry-run the release job
#   ./scripts/act-local.sh workflow_dispatch -j release --input version_bump=patch -n

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP_CREDS_DIST="${REPO_ROOT}/.github/actions/setup-credentials/dist/setup-credentials.js"
ACT_ENV_FILE="$(mktemp /tmp/act-env-XXXXX)"

# Clean up temp env file on exit
trap 'rm -f "${ACT_ENV_FILE}"' EXIT

# ---------------------------------------------------------------------------
# 1. Ensure `op` CLI is available and signed in
# ---------------------------------------------------------------------------
if ! command -v op &>/dev/null; then
  echo "❌ 1Password CLI (op) is not installed." >&2
  echo "   Install it: https://developer.1password.com/docs/cli/" >&2
  exit 1
fi

if ! op account list &>/dev/null; then
  echo "❌ Not signed in to 1Password CLI. Run: op signin" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Ensure dist is built
# ---------------------------------------------------------------------------
if [[ ! -f "${SETUP_CREDS_DIST}" ]]; then
  echo "🔨 dist not found — building now..."
  (cd "${REPO_ROOT}" && pnpm build)
fi

# ---------------------------------------------------------------------------
# 3. Fetch credentials from 1Password
# ---------------------------------------------------------------------------
echo "🔑 Fetching credentials from 1Password..."

GITHUB_APP_ID="$(op read 'op://Team AI Agent/Docker Agent GitHub Action/App ID')"
GITHUB_APP_PRIVATE_KEY="$(op read 'op://Team AI Agent/Docker Agent GitHub Action/private-key.pem')"

export GITHUB_APP_ID
export GITHUB_APP_PRIVATE_KEY

# ---------------------------------------------------------------------------
# 4. Generate a GITHUB_APP_TOKEN via @octokit/auth-app
# ---------------------------------------------------------------------------
echo "🤖 Generating GitHub App installation token..."

GITHUB_APP_TOKEN="$(
  cd "${REPO_ROOT}"
  npx tsx -e "
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

(async () => {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });

  const { data: org } = await octokit.apps.getOrgInstallation({ org: 'docker' });
  const { data: inst } = await octokit.apps.getInstallation({ installation_id: org.id });

  const perms = Object.fromEntries(
    Object.entries(inst.permissions ?? {}).filter(([, v]) => v != null),
  );

  const auth = createAppAuth({ appId, privateKey });
  const { token } = await auth({
    type: 'installation',
    installationId: org.id,
    permissions: perms,
  });

  process.stdout.write(token);
})();
"
)"

echo "✅ Token generated."

# ---------------------------------------------------------------------------
# 5. Write the temporary env file
# ---------------------------------------------------------------------------
# act's env-file format doesn't support multiline values, so we escape
# newlines in the PEM key. @octokit/auth-app handles \n in PEM strings.
ESCAPED_KEY="$(printf '%s' "${GITHUB_APP_PRIVATE_KEY}" | awk '{printf "%s\\n", $0}')"

cat > "${ACT_ENV_FILE}" <<EOF
GITHUB_APP_ID=${GITHUB_APP_ID}
GITHUB_APP_PRIVATE_KEY=${ESCAPED_KEY}
GITHUB_APP_TOKEN=${GITHUB_APP_TOKEN}
ORG_MEMBERSHIP_TOKEN=dummy
ANTHROPIC_API_KEY_FROM_SSM=dummy
OPENAI_API_KEY_FROM_SSM=dummy
EOF

# ---------------------------------------------------------------------------
# 6. Run act with the env file and any extra arguments
# ---------------------------------------------------------------------------
echo "🚀 Running: act --env-file ${ACT_ENV_FILE} $*"
echo ""

cd "${REPO_ROOT}"
act --env-file "${ACT_ENV_FILE}" "$@"
