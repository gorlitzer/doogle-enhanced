#!/bin/sh
# Run this AFTER making the repo public to enable branch protection on main.
# Requires: gh CLI authenticated with repo admin access.
#
# What this does:
#   - Requires CI (test + lint) to pass before merging to main
#   - Requires PRs (no direct pushes to main)
#   - Blocks force pushes and branch deletion on main
#   - Dismisses stale PR reviews when new commits are pushed
set -e

REPO="gorlitzer/doogle-enhanced"

echo "Setting branch protection on ${REPO}:main..."

gh api "repos/${REPO}/branches/main/protection" \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test", "lint"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo "Branch protection enabled."
echo ""
echo "Rules:"
echo "  - PRs required to merge into main"
echo "  - CI checks (test + lint) must pass"
echo "  - Force push and branch deletion blocked"
echo "  - Stale reviews dismissed on new commits"
echo ""
echo "Releases can only be created by tagging commits on main (enforced in release.yml)."
