# Public Release Safety

This workspace contains local game assets and extracted reference data that are
not intended for redistribution. The `.gitignore` file keeps those resources
out of the public source repository while leaving all local files untouched.

Before every public push:

```powershell
powershell -ExecutionPolicy Bypass -File tools/audit-public-release.ps1 -Staged
```

The audit must pass before committing or pushing.

## Important

- Do not use `git add -f` on ignored files.
- Do not publish the `story/data.js`, media files, official/extracted data
  files, campaign saves, or generated audit data.
- Files already committed before these rules were added must be removed from
  Git history separately. `.gitignore` does not erase existing history.
- Source code may still contain game names, identifiers, or small data tables.
  Review those manually before declaring the repository free of third-party
  content.

