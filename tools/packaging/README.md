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
The directory is created on demand and ignored in its entirety by Git. Nothing
is uploaded, tagged, or published automatically. See the root `README.md` for
commands, target names, runtime instructions, and output filenames.
