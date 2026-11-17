#!/usr/bin/env bash
# Deploy pitch by pinning both images in a home-k8s-lab overlay to <tag> and
# pushing the commit to home-k8s-lab's main. ArgoCD syncs it from there.
#
# Usage: bump-overlay.sh <env> <tag>     e.g. bump-overlay.sh dev 1a2b3c4
# Env:   GH_TOKEN  token with contents:write on paguos/home-k8s-lab
set -euo pipefail

env="${1:?usage: bump-overlay.sh <env> <tag>}"
tag="${2:?usage: bump-overlay.sh <env> <tag>}"
: "${GH_TOKEN:?GH_TOKEN (HOME_K8S_LAB_TOKEN secret) is not set}"

repo="paguos/home-k8s-lab"
overlay="manifests/pitch/overlays/${env}/kustomization.yaml"
workdir="$(mktemp -d)"

git clone --quiet "https://x-access-token:${GH_TOKEN}@github.com/${repo}.git" "$workdir"
cd "$workdir"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

[ -f "$overlay" ] || { echo "no overlay at $overlay" >&2; exit 1; }

# Quote the tag so an all-digit SHA isn't read back as a number.
TAG="$tag" yq -i '
  with(.images[] | select(.name | test("^ghcr.io/paguos/pitch/"));
    .newTag = strenv(TAG) | .newTag style="double")
' "$overlay"

if git diff --quiet; then
  echo "pitch-${env} already at ${tag}"
  exit 0
fi

git commit --quiet -am "chore(pitch): deploy ${tag} to ${env}" \
  -m "From ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-paguos/pitch}/commit/${GITHUB_SHA:-unknown}"

# Another deploy (the other env, or kubepad/cards) may have pushed meanwhile.
for attempt in 1 2 3 4 5; do
  if git push --quiet origin HEAD:main; then
    echo "deployed pitch ${tag} to ${env}"
    exit 0
  fi
  echo "push rejected (attempt ${attempt}), rebasing" >&2
  sleep $((attempt * 2))
  git pull --quiet --rebase origin main
done

echo "failed to push after 5 attempts" >&2
exit 1
