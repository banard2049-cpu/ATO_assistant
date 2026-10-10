# ATO Assistant

[中文](README.md) | **English**

ATO Assistant is a local web tool for running an Aeon Trespass: Odyssey (ATO) campaign. It contains the campaign dashboard, AIBP, story, map, the Argo record sheet, technology/gear, the campaign briefing and the second screen.

The repository publishes only the program and public placeholder data. Images, audio, complete story text and personal saves have to be supplied by you and never go into the Git repository.

## Interface language

The dashboard's language picker offers the fan translation, official Chinese and English. Click the button and choose from the popup; the choice is shared with the other modules and is kept after a reload. English game names and constant-box titles use the original English already present in the official app, its TTS or the data, while the tool's own buttons and status messages ship with English wording of their own.

English rules and story text need the original data locally. Content without an original shows a missing-text notice or a paragraph reference. Personal notes, custom names and card images keep their original content.

## Launching from a GitHub Release (recommended)

Download the matching version from [Releases](https://github.com/banard2049-cpu/ATO_assistant/releases) rather than the source ZIP.

### Windows

Download ATO-Assistant-Portable-<version>-windows-x64.zip, extract it completely, then double-click start-ato-portable.bat.

### macOS

- Apple Silicon: download ATO-Assistant-Portable-<version>-macos-arm64.zip
- Intel: download ATO-Assistant-Portable-<version>-macos-x64.zip

Extract it completely, then double-click start-ato-portable.command. If the system blocks the script, right-click it and choose "Open".

### Android

Download ATO-Assistant-<version>.apk and install it. If the system blocks the install, allow the current browser or file manager to install apps from unknown sources.

Once the second screen is switched on in the dashboard, the phone is also a LAN server: devices on the same subnet can view the second screen at its dedicated address (`/ss/`), and can also open the **dashboard address** (the second-screen address without `/ss/`, that is, the root address) to use the dashboard and the other modules. The second-screen card in the dashboard shows this address together with a "copy address" button.

- **Both reading and writing are open on the LAN**: changes go to the save on the phone, and conflicts are detected by section version exactly as with multi-device editing in the portable build. A stale version returns 409 and the page re-reads and retries by itself.
- **Sign in, sign up and sign out can only be done on the phone**: those three requests are not forwarded over the LAN, so another device cannot replace or end the phone's session. A LAN page uses the phone's account, so it does not need a login of its own.
- The LAN entry point of the portable build / Docker is a complete site to begin with; another device can open the root address, sign in and use it normally (the hint text then reads "sign in to use").
- The LAN address is only valid while the second screen is on; switching the second screen off (or signing out) closes that entry point as well. Turn it off when you do not need it and other devices on the subnet can no longer reach it.

### Saves and local images

The first launch on Windows/macOS creates an empty data/ directory, and campaign saves are stored there. Download images later and put them back into the matching directories:

~~~text
aibp/ps/
assets/
hero/assets/
map/images/
map/tokens/
record/assets/
ss/terrain/
ss/terrain-cards/
story/images/
technology/images/
~~~

If you already have an `.atopack` resource pack, see "Importing resources" below: extract it and drag the contents into the portable folder, and the images land in the directories above.

### Updating the version

The portable build can update itself from inside the program: click "check for updates" at the bottom of the dashboard, and once a new version is found an "update now" button appears. It downloads only the program files that actually changed this time (usually tens to hundreds of KB), instead of the whole package again.

- Only **program code** is updated. `data/` saves, local images, `.atopack` resource packs and the bundled PHP runtime are left alone; upgrading the PHP runtime still needs the full package.
- You have to do it in the program **on this computer** (the second screen on a LAN device cannot trigger an update), and you have to be signed in.
- Reload the page after the update to apply it. If the new version misbehaves, "restore previous version" sits in the same place.
- A failed download or verification can be retried; if it reports that writing the program files was interrupted, choose "restore previous version" first and update again. The restore entry point still works even when GitHub is temporarily unavailable. Restoring the program does not revert your campaign save changes.
- Portable builds up to 2.1.9 do not have this feature yet: download one new full package manually, and one-click updating works from then on.
- If you would rather not use it, the old way still works: extract into a new directory and keep `data/` and the local image directories from the old one.

Android cannot update incrementally; download the new APK from the release page and install it over the old one. For a Docker deployment run `docker compose pull && docker compose up -d`. Once the second screen is switched on in the dashboard, reach it at /ss/ on the current address.

### Importing resources (.atopack)

Image assets do not have to be downloaded one by one, and no asset library installation is needed: get the `.atopack` resource pack, extract it and drag it in.

1. Rename the `.atopack` to `.zip`, or open it directly with an archiver such as 7-Zip (it is a ZIP that simply uses a different extension).
2. Open the extracted folder and drag its directories (`aibp/`, `map/`, `record/`, `ss/`, `story/`, `technology/`, `hero/`, `assets/` and so on) into the root of the portable folder.
3. When the system asks whether to merge or replace folders of the same name, choose replace, then start the program again.

The pack keeps the project's relative paths, so copying it as described is enough for images and story data to work. The `manifest.json` in its root is the pack manifest and does no harm if it stays.

On Android use "import resources from .atopack" in the interface. For Docker / NAS, copy those extracted directories into the `app/` directory of the installation and reload the page; the read-only asset directories inside the container have to be filled on the host, and the web page has no resource-pack import entry point. Flat `assets/bgm/*.mp3` files also work directly.

To shoot, organize or export assets, use the [asset studio tool](asset-studio/README.md) (Chinese).

## Docker (server / NAS)

The GHCR image is publicly available. With `docker compose` installed (Compose v2.17+), sign in to the server over SSH and run this single line; systems that only have `docker-compose` should use the compatible configuration below:

~~~
curl -fsSL https://raw.githubusercontent.com/banard2049-cpu/ATO_assistant/main/tools/install-docker.sh | bash
~~~

Open http://server-ip:8793/. To update:

~~~bash
docker compose pull
docker compose up -d
~~~

New asset mounts also require syncing the new `compose.yaml` (older tools sync `compose.legacy.yaml`): `pull` updates the image only, not the Compose file on the host. For example, interface icons need the `./app/assets/icons:/app/assets/icons:ro` entry; after updating the configuration run `up -d` to recreate the container, and put the icons in `app/assets/icons/`.

Compose pulls the image on startup by default (`ATO_PULL_POLICY=always`); local builds use `never`. To pin a version, write `ATO_VERSION=<version from the release page>` in `.env` and run the install script, which then takes both the Compose configuration and the image of that version. A manual deployment must also use the Compose file from the same version tag; older images may lack the startup restore logic that the new asset mounts need, so changing only the image tag is not enough.

### Older docker-compose (including 32-bit systems)

Use [compose.legacy.yaml](tools/packaging/docker/compose.legacy.yaml), which requires `docker-compose` 1.21.0 or a newer v1 release (check with `docker-compose version`). It uses `version: "2.4"` and drops `pull_policy` / `bind.create_host_path`, which v1 does not support, while keeping the same ports, saves and all asset mounts.

Copy that file into the installation directory, next to `data/` and `app/`, and run from there. **Before the first start, `app/ss/battle-board.jpg` must be a file**; if an earlier failed start already created it as a directory, move that directory away first. `touch` does not empty an existing board image.

~~~bash
mkdir -p data app/ss
touch app/ss/battle-board.jpg
docker-compose -f compose.legacy.yaml pull && docker-compose -f compose.legacy.yaml up -d
~~~

Open `http://server-ip:8793/`. Updating still runs the `pull && up -d` above, and `docker-compose -f compose.legacy.yaml down` stops it. To pin a version, write `ATO_VERSION=<version from the release page>` in `.env` in the same directory and take the compatible configuration from that version tag. Every command carries `-f compose.legacy.yaml`, so an older tool does not read the `compose.yaml` that is meant for Compose v2 only.

### Image architectures and Raspberry Pi

The public image is published for `linux/amd64` and `linux/arm/v7`, with a single tag pointing at both, so Docker picks the right one for the host and you do not write `--platform`. **32-bit Raspberry Pi OS uses `linux/arm/v7`**, and a Raspberry Pi 3/4/5 running a 32-bit system can use that image too; start it with the compatible configuration above when only `docker-compose` is available, or use the one-line installer with Compose v2.17+.

When no prebuilt application image exists for another architecture, the one-line installer takes the source of the matching version, prepares a complete `app/` build directory with the release exporter, and builds locally. `linux/arm64` can use that path; other architectures additionally need PHP and Python base images that support the host architecture. The script stores the exact local image tag and `ATO_PULL_POLICY=never` in `.env`, so a later `docker compose up -d` starts directly. Rerun the install command to upgrade.

64-bit Raspberry Pi OS counts as `linux/arm64` and takes the local build path above; to avoid building it yourself, installing a 32-bit system and using the ready-made `linux/arm/v7` image is less work.

The install script takes the source of the latest tag from GitHub by default. To pin the source version, write `ATO_VERSION=<version from the release page>` in `.env` in the installation directory; the build still needs access to the source and the base images. When using your own image, set `ATO_IMAGE=ato-assistant:local` and `ATO_PULL_POLICY=never` as well; both Compose configurations support `ATO_IMAGE`.

The one-line install uses the current folder by default; `ATO_DIR=/path/to/dir` selects another installation directory. The script creates the mount points and the placeholder board image `app/ss/battle-board.jpg` (overwrite it with the real image and keep the file name), and downloads the [full Docker notes](tools/packaging/docker/README.txt) (Chinese) into the installation directory. BGM can go in `app/assets/bgm/audio/`, and audio flattened into `app/assets/bgm/` by a resource pack works immediately too, with no need to rerun the install script.

The local asset directories under data/ and app/ are mounted into the container, and pulling a new image does not delete them.

**Only assets are local inside the container; the program always comes from the image**, so `docker compose pull` updates everything (including the second-screen front end and the BGM player). The matching locations on the host:

| What to put there | Host location |
| --- | --- |
| Battle board image | `app/ss/battle-board.jpg` (single-file mount; the v2 configuration errors when the file is missing, and the compatible v1 configuration needs it created beforehand) |
| Second-screen terrain map / terrain cards | `app/ss/terrain/`, `app/ss/terrain-cards/` |
| Dashboard background music | `app/assets/bgm/` (audio flattened by a resource pack) or `app/assets/bgm/audio/` (preferred when names collide; see the [BGM notes](assets/bgm/README.md), Chinese) |
| Dashboard interface icons | `app/assets/icons/` (SVG icons supplied by a resource pack; read-only mount) |
| Cycle markers / exploration cards / story and doom cards | `app/assets/cycle-symbols/`, `app/assets/exploration-cards/`, `app/assets/story-doom-cards/` |
| Other local images | `app/map/images/`, `app/technology/images/`, `app/story/images/` and so on (see `compose.yaml`) |
| Private storybook data | `app/story/data/` (read-only mount) |
| Babelian / Siren glyphs | `app/story/assets/cryptic/glyphs/` (PNG glyphs from a resource pack; read-only mount, empty keyboard when missing) |

The `index.html` / `app.js` / `styles.css` / `terrain-data.js` under `app/ss/` are program files supplied by the image; older copies of the same names on the host have no effect and can simply be deleted.

## Asset studio tool

asset-studio/ is a standalone tool for shooting, importing and sharing assets. See [asset-studio/README.md](asset-studio/README.md) (Chinese) for the full description.

## Record sheet image attachments

Click the "+" to the right of the "counters" heading on the Argo record sheet to add a name and a quantity, edit the number directly or adjust it with "− / ＋". The quantity never goes below 0, and each cycle is saved separately. Counter text from older saves is moved automatically to the start of the matching cycle's "campaign notes", keeping the existing notes.

Below "campaign notes" on the Argo record sheet, image attachments are supported: click the "+" to the right of the heading to open the album, file and camera menu, or drag an image in, or paste a screenshot into the campaign notes. Click a thumbnail to enlarge it, edit the name under the image to rename it, and click "delete" to remove an attachment from the current cycle.

Images are saved per signed-in account and cycle, converted to JPG automatically, at most 2048 pixels on the longest side and at most 768 KB each. The portable build / NAS keeps them in `data/record-attachments/`, and Android keeps them in the app's private directory; ordinary saves record image references only. Both "export save" in the dashboard and the record sheet's own export put the images into the JSON backup, and importing restores them automatically. Migrating `data/` by hand means copying the whole directory. Deleting an attachment removes only the reference in the current record; the image file stays for historical backups to restore.

Mobile browsers use the system album, file and camera entry points, and the exact picker depends on the device; the Android app shoots with the system camera and needs no broad album permission. Convert formats the browser cannot read, such as HEIC, to JPG or PNG first.

## Storybook cipher notes

The bottom of the storybook's left sidebar expands a small "cipher notes" module that switches between Hekaton, Babelian and Siren. Hekaton supports 16 square symbols with manual digit mapping; Babelian and Siren support picking the original glyphs, editing character mappings, typing already-recorded characters on the keyboard, adding spaces and line breaks, selecting consecutive characters as a phrase, and saving and loading records. Character mappings, phrase notes, input and records are saved with the current campaign's record sheet and are included in the full state backup; saved records keep the character readings, phrase meanings and word-segmented text of that moment.

Babelian and Siren start with empty character mappings, and unknown characters can be filled in from the reference table of the [Babelian & Siren Translator repository](https://github.com/HUAHUOOo/Babelian-Siren-Translator), while existing manual mappings are kept. "Join characters into words" supports adjusting spaces and punctuation by hand as well as offline word-segmentation suggestions, without changing the original letters or unknown markers. Siren is entered by hand in the spiral reading order confirmed by players; the keyboard's mapping direction only helps identify glyphs and does not infer the spiral geometry. See the [asset notes](story/assets/cryptic/NOTICE.md) (Chinese) for the sources of the glyphs, word frequencies and algorithms.

## Campaign briefing

briefing/ is a standalone campaign briefing tool that replays **map tiles revealed** and **technology tree nodes lit** along the same date axis, and lists what happened on each day.

- There is only one data source: the daily save backups in `data/backups/<account>/daily/`. The snapshot kept when advancing to the next day counts as "the end state of that day", and subtracting two adjacent days gives that day's additions (tiles revealed, technology lit, story/constant progress, hero changes, map log).
- Which days the briefing covers depends on whether the backups still exist. A day without a backup under the retention policy shows "no record", and the diff compares the two surrounding snapshots directly across it.
- Backups hold state only, so this reports **net changes** only; equipment inventory and resource income/expense live in the save's `record` module (the technology page reads and writes them) and the briefing does not yet diff them, so they are not shown here.
- The entry point is among the save actions in the "user and saves" panel on the right of the dashboard (the briefing reads the daily backups, so it sits with the saves).
- "Export GIF / PDF" exports the map replay and the technology replay as one GIF each and lays the daily record out as a PDF, downloaded together as a zip. Frame rendering and GIF encoding both happen in the browser (the bundled PHP is a minimal build without GD/Imagick and cannot draw on the server side; and a browser cannot encode GIF by itself, so the MIT encoder `assets/vendor/gifenc.js` shipped with the source is used), so a campaign of several dozen days takes several dozen seconds, with progress shown under the heading.

## Licence and asset notice

From this licence change onwards the project's source code is released under the [PolyForm Noncommercial License 1.0.0](LICENSE), SPDX identifier `PolyForm-Noncommercial-1.0.0`. Noncommercial use, modification and distribution are allowed for personal, educational, research and public-interest purposes; commercial use is outside that licence and needs separate prior authorisation from the copyright holder. Distribution must include the licence text or its official URL and keep the `Required Notice` from the licence.

The licence covers only this repository's program code, not game assets. This project includes no licence for official game assets. Users must make sure for themselves that the origin and use of local images, story text and audio comply with the relevant licensing requirements.

The third-party runtimes, libraries and dependencies bundled in the portable ZIP, the Android APK and the Docker image are not covered by this project's PolyForm Noncommercial licence and remain governed by their own licences (PHP License 3.01 and so on).
