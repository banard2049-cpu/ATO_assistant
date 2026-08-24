ATO Assistant Docker Package

Requirements: Docker Desktop or Docker Engine with Compose.

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
Downloaded images remain in the app/ image folders mounted by compose, so
pulling a newer application image does not delete them.
No tools directory is included.
