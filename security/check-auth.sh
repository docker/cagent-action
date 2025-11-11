#!/bin/bash
# Check if user is authorized based on their association role
# Only organization OWNER, MEMBER, and COLLABORATOR roles are allowed

set -e

ASSOCIATION="$1"
ALLOWED_ROLES="$2"

echo "Checking authorization..."
echo "User association: $ASSOCIATION"
echo "Allowed roles: $ALLOWED_ROLES"

# Validate inputs
if [ -z "$ASSOCIATION" ]; then
  echo "::error::No association provided"
  exit 1
fi

if [ -z "$ALLOWED_ROLES" ]; then
  echo "::error::No allowed roles provided"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "::error::jq is not installed - cannot parse JSON"
  exit 1
fi

# Parse JSON array and check if user's association is in allowed list
# Use --arg to safely pass variables and prevent injection
if echo "$ALLOWED_ROLES" | jq -e --arg assoc "$ASSOCIATION" '. | any(. == $assoc)' > /dev/null 2>&1; then
  echo "✅ Authorization successful"
  echo "   User role '$ASSOCIATION' is allowed"
  echo "authorized=true" >> "$GITHUB_OUTPUT"
else
  echo "::error::═══════════════════════════════════════════════════════"
  echo "::error::❌ AUTHORIZATION FAILED"
  echo "::error::═══════════════════════════════════════════════════════"
  echo "::error::"
  echo "::error::User association: $ASSOCIATION"
  echo "::error::Allowed roles: $ALLOWED_ROLES"
  echo "::error::"
  echo "::error::Only trusted contributors can trigger reviews."
  echo "::error::Allowed: OWNER, MEMBER, COLLABORATOR"
  echo "::error::External contributors cannot use this action."
  echo "::error::"
  echo "::error::If you are a maintainer, ensure you have appropriate"
  echo "::error::permissions in the repository."
  echo "::error::═══════════════════════════════════════════════════════"

  echo "authorized=false" >> "$GITHUB_OUTPUT"
  exit 1
fi
