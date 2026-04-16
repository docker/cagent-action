#!/usr/bin/env bash
# update-consumers.sh — Update consumer repos that reference the
# docker/cagent-action reusable workflow to the latest release SHA.
#
# Usage:
#   ./scripts/update-consumers.sh [--dry-run]
#   SHA=abc123 VERSION=v1.4.1 ./scripts/update-consumers.sh [--dry-run]
#
# Flags:
#   --dry-run   Discover repos and preview diffs without cloning, pushing,
#               or creating PRs. Safe to run at any time.
#
# Override env vars (both must be set together or not at all):
#   SHA       Commit SHA to pin to (auto-detected from latest release if unset)
#   VERSION   Release tag name, e.g. v1.4.1 (auto-detected if unset)
#
# Requirements: gh (authenticated), git, jq

set -euo pipefail

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SELF_REPO="docker/cagent-action"
BRANCH_NAME="auto/update-cagent-action"
SEARCH_QUERY='org:docker "docker/cagent-action/.github/workflows/review-pr.yml@" language:YAML path:.github/workflows'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
DRY_RUN=false
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=true ;;
    *)
      echo -e "${RED}Unknown argument: ${arg}${NC}" >&2
      echo "Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if [[ "${DRY_RUN}" == true ]]; then
  echo -e "${YELLOW}${BOLD}🔍 DRY RUN MODE — no changes will be made${NC}"
  echo ""
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
COUNT_UPDATED=0
COUNT_SKIPPED=0
COUNT_FAILED=0

# ---------------------------------------------------------------------------
# Temp workspace — cleaned up automatically on exit
# ---------------------------------------------------------------------------
WORK_DIR="$(mktemp -d /tmp/update-cagent-XXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

# ---------------------------------------------------------------------------
# 1. Resolve VERSION and SHA
# ---------------------------------------------------------------------------
echo -e "${BLUE}${BOLD}📦 Resolving release info for ${SELF_REPO}...${NC}"

if [[ -z "${VERSION:-}" ]]; then
  VERSION="$(gh release view --repo "${SELF_REPO}" --json tagName --jq '.tagName')"
  echo "  VERSION (auto-detected): ${VERSION}"
else
  echo "  VERSION (env override):  ${VERSION}"
fi

if [[ -z "${SHA:-}" ]]; then
  SHA="$(gh api "repos/${SELF_REPO}/git/ref/tags/${VERSION}" --jq '.object.sha')"
  echo "  SHA     (auto-detected): ${SHA}"
else
  echo "  SHA     (env override):  ${SHA}"
fi

echo ""

# ---------------------------------------------------------------------------
# 2. Get authenticated GitHub user
# ---------------------------------------------------------------------------
GH_USER="$(gh api /user --jq '.login')"
GH_USER_EMAIL="$(gh api /user --jq '(.id | tostring) + "+" + .login + "@users.noreply.github.com"')"
echo -e "${BLUE}${BOLD}👤 Authenticated as: ${GH_USER}${NC}"
echo ""

# ---------------------------------------------------------------------------
# 3. Build PR body (written to a temp file to safely handle special chars)
# ---------------------------------------------------------------------------
PR_BODY_FILE="${WORK_DIR}/pr-body.md"
cat > "${PR_BODY_FILE}" <<EOF
Automated update of \`docker/cagent-action\` reusable workflow reference.

| Field | Value |
|-------|-------|
| Version | \`${VERSION}\` |
| SHA | \`${SHA}\` |
| Release | https://github.com/${SELF_REPO}/releases/tag/${VERSION} |

This PR was created automatically by \`scripts/update-consumers.sh\`.
EOF

# ---------------------------------------------------------------------------
# 4. Discover consumer repos via code search
# ---------------------------------------------------------------------------
echo -e "${BLUE}${BOLD}🔍 Searching for consumer repos...${NC}"

REPOS_RAW="$(
  gh api --method GET --paginate '/search/code?per_page=100' \
    -f q="${SEARCH_QUERY}" \
    --jq '[.items[] | {repo: .repository.full_name, path: .path}] | unique_by(.repo) | .[] | "\(.repo) \(.path)"'
)"

if [[ -z "${REPOS_RAW}" ]]; then
  echo "  No consumer repos found."
  exit 0
fi

# Exclude the cagent-action repo itself (handled by a separate workflow)
REPOS="$(echo "${REPOS_RAW}" | grep -v "^${SELF_REPO} " || true)"

if [[ -z "${REPOS}" ]]; then
  echo "  No external consumer repos found (only self)."
  exit 0
fi

REPO_COUNT="$(echo "${REPOS}" | wc -l | tr -d ' ')"
echo "  Found ${REPO_COUNT} external consumer repo(s)"
echo ""

# ---------------------------------------------------------------------------
# 5. Process each repo
# ---------------------------------------------------------------------------
while IFS=' ' read -r REPO FILE_PATH; do
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}📁 ${REPO}${NC}  ${CYAN}${FILE_PATH}${NC}"

  # ── Fetch current file content via the GitHub API ────────────────────────
  # Uses jq's @base64d to avoid relying on platform-specific base64 flags.
  CURRENT_CONTENT="$(
    gh api "repos/${REPO}/contents/${FILE_PATH}" \
      --jq '.content | gsub("\n"; "") | @base64d' 2>/dev/null || echo ""
  )"

  if [[ -z "${CURRENT_CONTENT}" ]]; then
    echo -e "  ${RED}❌ Could not fetch file — skipping${NC}"
    COUNT_FAILED=$((COUNT_FAILED + 1))
    continue
  fi

  # ── Check whether the target line is present ─────────────────────────────
  CURRENT_LINE="$(echo "${CURRENT_CONTENT}" | grep -F "review-pr.yml@" || echo "")"
  if [[ -z "${CURRENT_LINE}" ]]; then
    echo -e "  ${YELLOW}⚠️  No review-pr.yml@ line found in file — skipping${NC}"
    COUNT_SKIPPED=$((COUNT_SKIPPED + 1))
    continue
  fi

  # ── Check if already pinned to the target SHA ────────────────────────────
  if echo "${CURRENT_LINE}" | grep -qF "@${SHA}"; then
    echo -e "  ${GREEN}⏭️  Already at ${SHA:0:12}… — skipping${NC}"
    COUNT_SKIPPED=$((COUNT_SKIPPED + 1))
    continue
  fi

  # ── Determine repo access ────────────────────────────────────────────────
  REPO_INFO="$(
    gh api "repos/${REPO}" \
      --jq '{push: (.permissions.push // false), allow_forking: (.allow_forking // false)}' \
      2>/dev/null || echo '{"push":false,"allow_forking":false}'
  )"
  HAS_PUSH="$(echo "${REPO_INFO}" | jq -r '.push')"
  ALLOW_FORKING="$(echo "${REPO_INFO}" | jq -r '.allow_forking')"

  if [[ "${HAS_PUSH}" == "true" ]]; then
    ACCESS_MODE="push"
    echo -e "  ${GREEN}✅ Push access — will update directly${NC}"
  elif [[ "${ALLOW_FORKING}" == "true" ]]; then
    ACCESS_MODE="fork"
    echo -e "  ${YELLOW}🍴 No push access — will fork${NC}"
  else
    echo -e "  ${RED}🚫 No push access and forking disabled — skipping${NC}"
    COUNT_SKIPPED=$((COUNT_SKIPPED + 1))
    continue
  fi

  # ── Show the current → new diff ──────────────────────────────────────────
  # Extract the @ref portion (handles @sha, @latest, @sha # comment, etc.)
  CURRENT_REF="$(
    echo "${CURRENT_LINE}" \
      | grep -oE '@[^|]+' \
      | head -1 \
      | sed 's/[[:space:]]*$//' \
      || echo "@<unknown>"
  )"
  NEW_REF="@${SHA} # ${VERSION}"
  echo "  Current ref: ${CURRENT_REF}"
  echo "  New ref:     ${NEW_REF}"

  if [[ "${DRY_RUN}" == true ]]; then
    echo -e "  ${YELLOW}🔍 Dry run — no changes applied${NC}"
    COUNT_UPDATED=$((COUNT_UPDATED + 1))
    continue
  fi

  # ── Clone repo ───────────────────────────────────────────────────────────
  REPO_SHORT="${REPO##*/}"
  REPO_WORK_DIR="${WORK_DIR}/${REPO//\//-}"
  mkdir -p "${REPO_WORK_DIR}"

  echo "  🔄 Cloning..."
  if [[ "${ACCESS_MODE}" == "push" ]]; then
    CLONE_DIR="${REPO_WORK_DIR}/${REPO_SHORT}"
    if ! gh repo clone "${REPO}" "${CLONE_DIR}" -- --depth=1 -q 2>/dev/null; then
      echo -e "  ${RED}❌ Clone failed — skipping${NC}"
      COUNT_FAILED=$((COUNT_FAILED + 1))
      continue
    fi
  else
    # gh repo fork clones into a directory named after the repo; run it from
    # REPO_WORK_DIR so the clone lands in a predictable path.
    (
      cd "${REPO_WORK_DIR}"
      # "Already exists" is fine — suppress noise but show real errors
      gh repo fork "${REPO}" --clone -- --depth=1 2>&1 \
        | grep -v "^$" | sed 's/^/    /' || true
    )
    CLONE_DIR="${REPO_WORK_DIR}/${REPO_SHORT}"
  fi

  if [[ ! -d "${CLONE_DIR}" ]]; then
    echo -e "  ${RED}❌ Clone directory not found after clone/fork — skipping${NC}"
    COUNT_FAILED=$((COUNT_FAILED + 1))
    continue
  fi

  # ── Git operations (subshell keeps CWD changes contained) ────────────────
  # Exit codes:
  #   0  → committed and pushed successfully
  #   42 → no file changes after sed (already up to date on-disk)
  #   *  → unexpected failure
  GIT_RESULT=0
  (
    cd "${CLONE_DIR}"

    git config user.name "${GH_USER}"
    git config user.email "${GH_USER_EMAIL}"

    # Create the update branch (or reuse if it already exists)
    git checkout -b "${BRANCH_NAME}" 2>/dev/null \
      || git checkout "${BRANCH_NAME}" 2>/dev/null

    # Apply the replacement.
    # Pattern uses @.* (greedy) to handle all known ref formats:
    #   @<sha> # v1.x.x   — normal pinned SHA + version comment
    #   @latest            — bare branch/tag reference
    #   @<sha> # latest    — pinned SHA with non-version comment
    sed -i.bak \
      "s|docker/cagent-action/\.github/workflows/review-pr\.yml@.*|docker/cagent-action/.github/workflows/review-pr.yml@${SHA} # ${VERSION}|g" \
      "${FILE_PATH}" && rm -f "${FILE_PATH}.bak"

    git add "${FILE_PATH}"

    # Nothing changed (sed was a no-op) — signal with exit code 42
    if git diff --cached --quiet; then
      exit 42
    fi

    git commit -m "chore: update cagent-action to ${VERSION}" -q
    git push --force origin "${BRANCH_NAME}" -q
  ) || GIT_RESULT=$?

  if [[ "${GIT_RESULT}" -eq 42 ]]; then
    echo -e "  ${YELLOW}⏭️  No changes after replacement — skipping${NC}"
    COUNT_SKIPPED=$((COUNT_SKIPPED + 1))
    continue
  elif [[ "${GIT_RESULT}" -ne 0 ]]; then
    echo -e "  ${RED}❌ Git operations failed (exit ${GIT_RESULT}) — skipping${NC}"
    COUNT_FAILED=$((COUNT_FAILED + 1))
    continue
  fi

  echo "  📤 Branch pushed successfully"

  # ── Create or update PR ──────────────────────────────────────────────────
  echo "  📝 Creating/updating PR..."

  # For fork PRs the head must use the format <user>:<branch>
  if [[ "${ACCESS_MODE}" == "fork" ]]; then
    PR_HEAD="${GH_USER}:${BRANCH_NAME}"
  else
    PR_HEAD="${BRANCH_NAME}"
  fi

  # Check whether a PR already exists for this branch
  EXISTING_PR="$(
    gh pr list \
      --repo "${REPO}" \
      --head "${PR_HEAD}" \
      --json number \
      --jq '.[0].number' \
      2>/dev/null || echo ""
  )"

  if [[ -n "${EXISTING_PR}" && "${EXISTING_PR}" != "null" ]]; then
    echo "  🔄 Updating existing PR #${EXISTING_PR}..."
    if gh pr edit "${EXISTING_PR}" \
      --repo "${REPO}" \
      --title "chore: update cagent-action to ${VERSION}" \
      --body-file "${PR_BODY_FILE}"; then
      echo -e "  ${GREEN}✅ Done${NC}"
      COUNT_UPDATED=$((COUNT_UPDATED + 1))
    else
      echo -e "  ${RED}❌ Failed to update PR #${EXISTING_PR}${NC}"
      COUNT_FAILED=$((COUNT_FAILED + 1))
    fi
  else
    if PR_URL=$(gh pr create \
      --repo "${REPO}" \
      --head "${PR_HEAD}" \
      --title "chore: update cagent-action to ${VERSION}" \
      --body-file "${PR_BODY_FILE}"); then
      echo -e "  ${GREEN}✅ ${PR_URL}${NC}"
      COUNT_UPDATED=$((COUNT_UPDATED + 1))
    else
      echo -e "  ${RED}❌ Failed to create PR${NC}"
      COUNT_FAILED=$((COUNT_FAILED + 1))
    fi
  fi

done <<< "${REPOS}"

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ "${DRY_RUN}" == true ]]; then
  echo -e "${BOLD}📊 Summary (DRY RUN)${NC}"
  echo -e "  ${GREEN}✅ Would update: ${COUNT_UPDATED}${NC}"
else
  echo -e "${BOLD}📊 Summary${NC}"
  echo -e "  ${GREEN}✅ Updated:      ${COUNT_UPDATED}${NC}"
fi
echo -e "  ${YELLOW}⏭️  Skipped:      ${COUNT_SKIPPED}${NC}"
echo -e "  ${RED}❌ Failed:       ${COUNT_FAILED}${NC}"

if [[ "${DRY_RUN}" == true ]]; then
  echo ""
  echo -e "${YELLOW}  Run without --dry-run to apply changes.${NC}"
fi
