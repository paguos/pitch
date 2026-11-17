# Releasing and deploying

pitch runs on the home k8s lab ([paguos/home-k8s-lab](https://github.com/paguos/home-k8s-lab), `docs/apps/pitch.md`). Deploys are git commits to that repo, which ArgoCD syncs.

| Env | URL | Gets deployed when | Image tag |
|---|---|---|---|
| dev | https://pitch-dev.korat-chromatic.ts.net | every push/merge to `main` | short SHA (`1a2b3c4`) |
| prod | https://pitch.korat-chromatic.ts.net | a release is cut | version (`0.2.0`) |

## Flow (`.github/workflows/ci.yml`)

1. Push to `main` runs lint and tests.
2. **release-please** updates the open `chore(main): release X.Y.Z` PR (version bump in `.release-please-manifest.json` and `frontend/package.json`, plus `CHANGELOG.md`).
3. **publish** builds arm64 images tagged `<sha>` and `main`, plus `X.Y.Z` on a release.
4. **deploy dev** pins `manifests/pitch/overlays/dev` to `<sha>` (`.github/scripts/bump-overlay.sh`).
5. **deploy prod** runs only when step 2 cut a release, and pins `overlays/prod` to `X.Y.Z`.

## Cutting a release

Merge the release PR. That's it. Its merge is itself a push to `main`, so the same run tags `vX.Y.Z`, publishes, and deploys to both dev and prod.

Versions come from Conventional Commit types since the last release: `fix:` gives a patch and `feat:` gives a minor. Before 1.0, `feat!:` / `BREAKING CHANGE` also only bumps the minor (`bump-minor-pre-major`). `chore:`, `docs:`, `refactor:` and `ci:` don't trigger a release on their own. To force a specific version, add a `Release-As: 1.0.0` footer to a commit.

The footer shows the version baked into the frontend image (`VITE_APP_VERSION`): `vX.Y.Z` on releases, the short SHA otherwise, and `dev` locally.

## Rollback

Revert the `chore(pitch): deploy … to prod` commit in home-k8s-lab (or set an older version in the overlay) and push. Released images are never overwritten.

## One-time setup

- Secret `HOME_K8S_LAB_TOKEN`: a fine-grained PAT with **Contents: read and write** on `paguos/home-k8s-lab` only.
- Settings → Actions → General → enable **"Allow GitHub Actions to create and approve pull requests"** (release-please opens its PR with `GITHUB_TOKEN`).
- PRs opened with `GITHUB_TOKEN` don't trigger workflows, so CI won't run on the release PR itself. That's fine: it only touches the version files and changelog, and the merge to `main` runs the full pipeline.
