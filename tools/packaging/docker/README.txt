ATO Assistant Docker Package

Requirements: Docker Desktop or Docker Engine with Compose v2 (the compose file uses
`bind.create_host_path`, which needs Compose 2.17 or newer).
For legacy docker-compose v1 (1.21.0+), use compose.legacy.yaml as described below.

A clone of the repository only. Nobody's pictures, audio, or saves travel with it.

Architectures
-------------
The published image covers linux/amd64 and linux/arm/v7 (32-bit Raspberry Pi OS),
so `docker compose pull` picks the right one on its own. On any other architecture
(linux/arm64, ...) there is no prebuilt image: build it here instead on
the machine that will run it, which resolves the base image for the local
architecture:

  docker build -t ato-assistant:local .

Then point compose at that image before starting, in a `.env` file next to
compose.yaml:

  ATO_IMAGE=ato-assistant:local
  ATO_PULL_POLICY=never

The one-line installer (tools/install-docker.sh in the repository) does this by
itself when the prebuilt image does not exist for the local architecture: it
fetches the matching source tag, prepares an audited app/ export using a Python
helper container, builds, and saves the exact image tag and ATO_PULL_POLICY=never
in .env (a locally built image is not in any registry, so
`always` would try to pull something that does not exist). Upgrading then means
running the installer again.

Start:
  docker compose up -d

Open:
  http://127.0.0.1:8793/

Stop:
  docker compose down

Update:
  For 3.6.1-rc.2, first replace compose.yaml (or compose.legacy.yaml) with the file
  from the same release tag, preserving your custom ports and deployment settings.
  Set ATO_VERSION=3.6.1-rc.2 in .env; prereleases do not update latest.
  Install the updated 2026-10-19 atopack into app/ using the current Asset Studio.
  Update the application and resource pack together: the program supplies the
  AI/BP shared-back mapping, while the pack supplies the corrected JPEGs and
  layered map images. Updating the image alone does not refresh these resources.
  docker compose pull
  docker compose up -d

(With a locally built image there is nothing to pull: rebuild it and recreate the
container instead — `docker build -t ato-assistant:local . && docker compose up -d`.)

The package starts with an empty data directory. Saves remain in ./data.

Legacy docker-compose (including 32-bit Raspberry Pi OS)
------------------------------------------------------
Use compose.legacy.yaml next to data/ and app/. It uses version "2.4" and omits
pull_policy and bind.create_host_path, which v1 does not support. The image, port,
saves and artwork paths are the same as in compose.yaml. It pulls the published
image; for a local build, set ATO_IMAGE in .env and omit the pull command.

The battle board and its thumbnail share one directory mount. Prepare the folder:

  mkdir -p data app/ss/battle-board
  docker-compose -f compose.legacy.yaml pull && docker-compose -f compose.legacy.yaml up -d

Put battle-board.jpg and battle-board.jpg.preview.jpg in app/ss/battle-board/.
No placeholder image is required. Visit http://127.0.0.1:8793/ (or use your server's IP).

Update: repeat the pull && up -d command above; up alone may reuse the old image.
Stop: docker-compose -f compose.legacy.yaml down
Pin a version: put ATO_VERSION=<release version> in .env and use the Compose file
from that same release tag. Older images may not restore the program data hidden
by newer aibp/ps mounts. The installer selects matching Compose and image versions.
Always pass -f compose.legacy.yaml; compose.yaml requires Compose v2.

Which parts live on the host
----------------------------
Program files always come from the image; only your own artwork and audio are bind
mounted from this folder:

  app/ss/battle-board/      决战版图原图与 AIBP 缩略图. One directory contains
                            battle-board.jpg and battle-board.jpg.preview.jpg.
                            The second screen uses the original; AIBP uses the thumbnail.
  app/ss/terrain/           第二屏地形图 (second-screen terrain tiles)
  app/ss/terrain-cards/     第二屏地形卡 (second-screen terrain cards)
  app/assets/bgm/audio/    主控台背景音乐. Put .mp3 / .ogg files here; the file names
                            are listed in assets/bgm/README.md.
  app/assets/bgm/          Resource-pack audio may also stay flat in this directory;
                            it is mounted at assets/bgm/media/ without hiding the
                            player code. Importing after installation works directly.
                            A same-name file in audio/ takes precedence.
  app/assets/icons/        主控台界面 SVG 图标. Install the resource pack into app/;
                            its assets/icons/*.svg files are mounted read-only.
  app/story/assets/cryptic/glyphs/  巴别语／塞壬语字形 (glyphs/*.png). Install the resource
                            pack into app/; these files are mounted read-only. The program
                            files next to them (glyph-catalog.js, word-data.js) come from the
                            image, so only this glyph folder is mounted.
  app/story/assets/mixed-media/images/  混排图裁图 (images/c1..c5/*.png|.svg). Install the
                            resource pack into app/; this folder is mounted read-only.
  app/story/assets/mixed-media/mapping.js  私有混排映射表 (single file, several MB of JSON).
                            The package ships a 0-byte placeholder; replace it with the real
                            table. renderer.js / styles.css next to it are program code and
                            come from the image, so only this folder and that one file are
                            mounted. Without the table and the crops, story pages render as
                            plain text with no inline or block artwork.
  app/story/images/         Storybook illustrations. All story battle boards are retired from
                            this tree (C1-C5): their folders (story/images/battles/,
                            story/images/c5/supplement-pages/) are gone from the project, and
                            the boards arrive as mixed-media inline images through mapping.js
                            (see above). Install the resource pack into app/ and they show up
                            without extra setup. The story folder itself is still mounted but
                            now normally stays empty.
  app/story/assets/OO/      c1.5 / c2.5 的「导言」章节配图 (DY1P5.png, DY2P5.png). 这些是私有
                            素材（公开镜像里没有），由资料包提供；本目录只读挂载，请保持文件名。
                            它们 2026-10-05 从 story/images/OO/ 搬到这里，所以不再靠 app/story/images/
                            覆盖。
  app/assets/cycle-symbols/ 五个循环的标记图标 (c1-brown.png, c2-red.png, c3-purple.png,
                            c4-yellow.png, c5-black-transparent.png). Keep those file names.
                            A missing file is simply not drawn, so nothing breaks.
  app/assets/.../           Other locally supplied images (see compose.yaml).
  app/story/data/           Private Storybook data (storybook-data.js); mounted read-only.

Anything inside a mounted folder that ships with the image is shadowed by this folder,
so `docker compose pull` cannot update it. That is why the compose file mounts only the
asset sub-paths:

  - 第二屏前端 (ss/index.html, ss/app.js, ss/styles.css, ss/terrain-data.js) comes from
    the image. An older copy of those files sitting in app/ss/ on the host is ignored
    and can be deleted.
  - 播放器 (assets/bgm/bgm.js, assets/bgm/manifest.js) comes from the image, which is
    why host audio folders are mounted at audio/ and media/ instead of covering
    the player's own directory.

Resource packs in Docker / NAS
-----------------------------
The web .atopack import button is available on Android only. In Docker / NAS,
unzip the pack on the host and copy its aibp/, assets/, story/, etc. directories
into this package's app/ directory, then refresh the page. Read-only mounts are
populated from the host. Glyph PNGs belong in app/story/assets/cryptic/glyphs/;
without them the Babelian/Siren keyboard has no glyphs. Mixed-media crops belong in
app/story/assets/mixed-media/images/ and the private map (a single file) in
app/story/assets/mixed-media/mapping.js — the package ships a 0-byte placeholder
there; without both, story pages show their text without the mixed-media artwork.

No audio files and no official game artwork are included in the public image (copyright),
so those folders are yours to fill.

Upgrading the battle-board mount
-------------------------------
Update compose.yaml (or compose.legacy.yaml) along with the image, replacing the
old single-file mount with ./app/ss/battle-board:/app/ss/battle-board:ro, then
recreate the container. Pulling the image alone does not update the host Compose file.
The installer copies old app/ss/battle-board.jpg and its matching preview into
the new directory, retains the old files for pinned older images, and never
overwrites existing files in the new directory. For a manual upgrade or an old
resource pack, put both files in the new directory yourself. On a source checkout,
python tools/generate_aibp_previews.py also copies an old board to the new path
when needed and generates the thumbnail (requires Pillow).
