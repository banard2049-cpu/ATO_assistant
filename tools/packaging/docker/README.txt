ATO Assistant Docker Package

Requirements: Docker Desktop or Docker Engine with Compose v2 (the compose file uses
`bind.create_host_path`, which needs Compose 2.17 or newer).

Start:
  docker compose up -d

Open:
  http://127.0.0.1:8793/

Stop:
  docker compose down

Update:
  docker compose pull
  docker compose up -d

The package starts with an empty data directory. Saves remain in ./data.

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
