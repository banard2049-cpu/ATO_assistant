# ATO Assistant

[中文](README.md) | **English**

A local campaign companion for *Aeon Trespass: Odyssey*. Track your campaign from the dashboard and open the AIBP battle tool, storybook, map, Argo record sheet, and arsenal.

## Install

Download the package for your platform from [GitHub Releases](https://github.com/banard2049-cpu/ATO_assistant/releases).

| Platform | How to install |
| --- | --- |
| Windows | Download `ATO-Assistant-Portable-<version>-windows-x64.zip`, extract the entire archive, and double-click `start-ato-portable.bat`. |
| macOS | Download the archive ending in `macos-arm64.zip` for Apple Silicon or `macos-x64.zip` for Intel. Extract the entire archive and double-click `start-ato-portable.command`. If macOS blocks it, right-click the launcher and choose **Open**. |
| Android | Download and install `ATO-Assistant-<version>.apk`. If prompted, allow your browser or file manager to install apps from unknown sources. |

### Docker / NAS

Run this from the installation directory. It requires Docker Compose v2.17 or later.

```bash
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
```

Open `http://<server-ip>:8793/` in your browser. For older Compose versions and other setups, see the [Docker installation guide](tools/packaging/docker/README.txt).

## Import a resource pack

Resource packs (`.atopack`) supply card images, music, and the full story text.

- **Android** — On the dashboard, choose the `.atopack` import button and select the file.
- **Windows / macOS** — Open the `.atopack` in an archive tool or rename it to `.zip` first. Merge the extracted resource folders into the portable app folder, then refresh the page.
- **Docker / NAS** — Extract the pack and merge the resource folders into `app/` on the host, then refresh the page.

## Start playing

1. Create a local account and sign in. You can change the interface language on the dashboard.
2. Select your campaign and cycle, then follow the dashboard's play sequence. To resume an existing campaign, choose **Import save** and select an ATO Assistant `.json` backup or an official app `.jsave` file.
3. To show the battle on another device, enable **Second Screen** on the dashboard and open the displayed URL on a device on the same local network.

## Update and back up

Choose **Export save** before updating or moving to another device. Portable and Docker installations keep local saves in `data/`.

- **Portable** — Sign in on the host computer and use **Check for updates** on the dashboard to install the update.
- **Android** — Download the new APK from the release page and install it over your current version.
- **Docker / NAS** — Run `docker compose pull && docker compose up -d` from the installation directory.

## License

The source code is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Game assets and third-party components have their own licenses.
