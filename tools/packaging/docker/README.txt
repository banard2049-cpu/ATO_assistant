ATO Assistant Docker Package

Requirements: Docker Desktop or Docker Engine with Compose v2 (the compose file uses
`bind.create_host_path`, which needs Compose 2.17 or newer).
For legacy docker-compose v1 (1.21.0+), use compose.legacy.yaml as described below.

A clone of the repository only. Nobody's pictures, audio, or saves travel with it.

Architectures
-------------
The published image covers linux/amd64 and linux/arm/v7 (32-bit Raspberry Pi OS),
so `docker compose pull` picks the right one on its own. On any other architecture
(linux/arm64, riscv64, ...) there is no prebuilt image: build it here instead on
the machine that will run it, which resolves the base image for the local
architecture:

  docker build -t ato-assistant:local .

Then point compose at that image before starting, in a `.env` file next to
compose.yaml:

  ATO_IMAGE=ato-assistant:local

The one-line installer (tools/install-docker.sh in the repository) does this by
itself when the prebuilt image does not exist for the local architecture: it
fetches the matching source tag, builds, and rewrites compose to use the local
image with `pull_policy: never` (a locally built image is not in any registry, so
`always` would try to pull something that does not exist). Upgrading then means
running the installer again.

Start:
  docker compose up -d

Open:
  http://127.0.0.1:8793/

Stop:
  docker compose down

Update:
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
image; for a local build, build with docker build and edit its image: line.

Before the first start, app/ss/battle-board.jpg must be a FILE, not a directory.
Move aside any directory created there by an earlier failed start before running:

  mkdir -p data app/ss
  touch app/ss/battle-board.jpg
  docker-compose -f compose.legacy.yaml pull && docker-compose -f compose.legacy.yaml up -d

touch preserves any existing image content. Replace an empty placeholder with your
real board image later. Visit http://127.0.0.1:8793/ (or use your server's IP).

Update: repeat the pull && up -d command above; up alone may reuse the old image.
Stop: docker-compose -f compose.legacy.yaml down
Pin a version: put ATO_VERSION=1.3.6 in .env next to compose.legacy.yaml.
Always pass -f compose.legacy.yaml; compose.yaml requires Compose v2.

Which parts live on the host
----------------------------
Program files always come from the image; only your own artwork and audio are bind
mounted from this folder:

  app/ss/battle-board.jpg   决战版图底图. The package ships a 0-byte placeholder;
                            replace it with the real image, keep the file name.
  app/ss/terrain/           第二屏地形图 (second-screen terrain tiles)
  app/ss/terrain-cards/     第二屏地形卡 (second-screen terrain cards)
  app/assets/bgm/audio/    主控台背景音乐. Put .mp3 / .ogg files here; the file names
                            are listed in assets/bgm/README.md.
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
    why the audio lives one level deeper in assets/bgm/audio/.

No audio files and no official game artwork are included in the public image (copyright),
so those folders are yours to fill.
