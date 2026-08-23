# Local export packaging

The scripts in this directory are development-only inputs. They are never copied
into an APK, Portable ZIP, or Docker ZIP.

## Outputs

- `../export_android.py`: installable Android APK with a WebView shell and native
  local campaign storage. Missing JDK, Gradle, and Android SDK components are
  downloaded automatically; running the tool indicates acceptance of their
  respective licenses.
- `../export_portable.py`: Windows x64, macOS arm64, macOS x64, and Docker ZIPs.
  Desktop ZIPs include the matching self-contained PHP runtime.

Both builders use `package_common.py` to exclude Git metadata, CI files,
`asset-studio`, every directory named `tools`, prior release output, logs,
backups, and every existing `data` directory. Portable launchers create `data` on first run; Docker
creates it through its volume/container startup; Android uses app-private storage.

Finished files are written to the repository's untracked `export` directory.
The directory is created on demand and ignored in its entirety by Git.

`../release_android.ps1 -Version 1.2.0` audits and builds a local APK plus its
SHA-256 file. Add `-Publish` to create or update `v1.2.0` with GitHub CLI. A
published build requires the four `ATO_ANDROID_*` signing environment variables.

`.github/workflows/android-release.yml` runs the same release script for `v*`
tags and manual dispatches. Configure these repository secrets before running it:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

The signing key must remain stable across releases or Android will reject APK
updates. From a clean worktree, `../push_android_release.ps1 -Version 1.2.0`
creates and pushes the release tag. Add `-CommitAll` to explicitly stage and
commit all current changes before pushing. See the root `README.md` for target
names and runtime instructions.

`../release_portable.ps1 -Version 1.2.0` audits and builds the Windows x64,
macOS arm64, and macOS x64 Portable ZIPs plus SHA-256 files. Add `-Publish` to
attach them to the matching GitHub Release. `.github/workflows/portable-release.yml`
runs this for `v*` tags and manual dispatches; it shares the release safely with
the Android workflow.
