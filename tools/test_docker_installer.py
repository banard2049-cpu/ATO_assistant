"""Run the installer with isolated command stubs, without a daemon or network.

The stubs reject incomplete build contexts and wrong images at Compose startup.
An installed Docker CLI also checks real Compose interpolation through `config`.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def shell_path(path: Path) -> str:
    text = path.resolve().as_posix()
    return "/" + text[0].lower() + text[2:] if os.name == "nt" else text


def run_installer_regressions() -> list[str]:
    bash = shutil.which("bash")
    if not bash:
        return ["Docker 安装行为测试需要 Bash"]
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ato-docker-install-") as temp:
        base = Path(temp)
        commands = base / "bin"
        commands.mkdir()
        scripts = {
            "curl": r'''#!/usr/bin/env bash
set -eu
printf 'curl %s\n' "$*" >> "$TEST_LOG"
if [[ "$*" == *compose.yaml* ]]; then cp "$FIXTURE_COMPOSE" "${@: -1}";
else cp "$FIXTURE_README" "${@: -1}"; fi
''',
            "git": r'''#!/usr/bin/env bash
set -eu
printf 'git %s\n' "$*" >> "$TEST_LOG"
if [ "$1" = ls-remote ]; then printf 'abc\trefs/tags/v3.5.4\n';
elif [ "$1" = clone ]; then
  target="${@: -1}"
  mkdir -p "$target/.git" "$target/tools/packaging/docker"
  cp "$FIXTURE_DOCKERFILE" "$target/tools/packaging/docker/Dockerfile"
fi
''',
            "docker": r'''#!/usr/bin/env bash
set -eu
printf 'docker %s\n' "$*" >> "$TEST_LOG"
case "$1" in
  pull)
    [ "$TEST_MODE" != fallback ] && [ "$TEST_MODE" != custom-fail ] || exit 1
    printf '%s\n' "$2" > "$TEST_STATE"
    ;;
  image) [ "$TEST_MODE" = custom-local ] ;;
  run)
    [ "$TEST_MODE" = fallback ]
    [[ "$*" == *'python tools/export_portable.py --target docker'* ]]
    version="${@: -1}"
    context="$PWD/.ato-src/tools/.ato-build/ATO-Assistant-Docker-$version"
    mkdir -p "$context/app"
    cp "$FIXTURE_DOCKERFILE" "$context/Dockerfile"
    printf '<!doctype html>\n' > "$context/app/index.html"
    ;;
  build)
    [ "$2" = -t ]
    [ -f "$4/Dockerfile" ] && [ -f "$4/app/index.html" ]
    printf '%s\n' "$3" > "$TEST_STATE"
    ;;
  compose)
    [ "$2 $3" = 'up -d' ]
    grep -q 'ATO_IMAGE' compose.yaml
    ! grep -q '^[[:space:]]*build:' compose.yaml
    expected="$(cat "$TEST_STATE" 2>/dev/null || printf 'ato-assistant:local')"
    [ "$ATO_IMAGE" = "$expected" ]
    grep -Fxq "ATO_IMAGE=$expected" .env
    if [ "$TEST_MODE" = fallback ] || [ "$TEST_MODE" = custom-local ]; then
      [ "$ATO_PULL_POLICY" = never ]
      grep -Fxq 'ATO_PULL_POLICY=never' .env
    fi
    printf 'started %s %s\n' "$ATO_IMAGE" "$ATO_PULL_POLICY" >> "$TEST_LOG"
    ;;
  *) exit 99 ;;
esac
''',
        }
        for name, source in scripts.items():
            command = commands / name
            command.write_text(source, encoding="utf-8", newline="\n")
            command.chmod(0o755)
        for mode in ("fallback", "prebuilt", "custom-local", "custom-fail", "pinned"):
            folder = base / mode
            folder.mkdir()
            log = folder / "commands.log"
            state = folder / "image.state"
            initial = "UNRELATED_SETTING=keep\n"
            if mode == "custom-local":
                initial += "ATO_IMAGE=ato-assistant:local\n"
            if mode == "pinned":
                initial += "ATO_VERSION=1.3.1\n"
            (folder / ".env").write_text(initial, encoding="utf-8")
            env = dict(os.environ)
            for key in ("ATO_IMAGE", "ATO_VERSION", "ATO_PULL_POLICY", "ATO_DIR"):
                env.pop(key, None)
            # Bash converts inherited Windows PATH; add the stubs within Bash
            # instead of putting a mixed Windows/POSIX value in its environment.
            env.update({
                "TEST_BIN": shell_path(commands),
                "TEST_MODE": "prebuilt" if mode == "pinned" else mode,
                "TEST_LOG": shell_path(log), "TEST_STATE": shell_path(state),
                "FIXTURE_COMPOSE": shell_path(ROOT / "tools/packaging/docker/compose.yaml"),
                "FIXTURE_README": shell_path(ROOT / "tools/packaging/docker/README.txt"),
                "FIXTURE_DOCKERFILE": shell_path(ROOT / "tools/packaging/docker/Dockerfile"),
                "TEST_INSTALLER": shell_path(ROOT / "tools/install-docker.sh"),
            })
            if mode == "custom-fail":
                env["ATO_IMAGE"] = "registry.invalid/custom:requested"
            command = [bash, "-c", 'export PATH="$TEST_BIN:$PATH"; bash "$TEST_INSTALLER"']
            result = subprocess.run(command, cwd=folder, env=env, text=True, encoding="utf-8", capture_output=True, timeout=60)
            output = (result.stdout + result.stderr).strip()
            if mode == "custom-fail":
                if result.returncode == 0 or (log.exists() and "docker build" in log.read_text()):
                    failures.append("自定义镜像拉取失败时不得静默本地构建")
                continue
            if result.returncode:
                failures.append(f"安装行为 {mode} 失败：{output[-700:]}")
                continue
            settings = (folder / ".env").read_text(encoding="utf-8")
            calls = log.read_text(encoding="utf-8")
            if "UNRELATED_SETTING=keep" not in settings or not (folder / "README-DOCKER.txt").is_file():
                failures.append(f"安装行为 {mode} 没有保留 .env 或下载素材指南")
            if mode == "fallback":
                if "started ato-assistant:3.5.4 never" not in calls:
                    failures.append("本地构建与启动未使用同一个准确版本标签")
                again = subprocess.run(command, cwd=folder, env=env, text=True, encoding="utf-8", capture_output=True, timeout=60)
                if again.returncode or log.read_text().count("docker build -t ato-assistant:3.5.4") != 2:
                    failures.append("重跑安装脚本没有重建已管理的本地镜像")
            if mode == "custom-local" and "docker pull" in calls:
                failures.append("已存在的自定义本地镜像不应去 registry 拉取")
            if mode == "pinned":
                if "/v1.3.1/tools/packaging/docker/compose.yaml" not in calls or "started ghcr.io/banard2049-cpu/ato_assistant:1.3.1" not in calls:
                    failures.append("固定版本的配置与镜像没有选择同一个源码标签")

    docker = shutil.which("docker")
    if docker:
        env = dict(os.environ, ATO_IMAGE="ato-assistant:local", ATO_PULL_POLICY="never")
        checked = subprocess.run([docker, "compose", "-f", str(ROOT / "tools/packaging/docker/compose.yaml"),
                                  "config", "--format", "json"], env=env, text=True, encoding="utf-8", capture_output=True)
        if checked.returncode:
            failures.append("Docker Compose 无法解析配置：" + checked.stderr[-500:])
        else:
            service = json.loads(checked.stdout)["services"]["ato"]
            if service["image"] != "ato-assistant:local" or service["pull_policy"] != "never":
                failures.append("Docker Compose 未应用本地镜像/拉取策略覆盖")
    release = (ROOT / "tools/release_portable.ps1").read_text(encoding="utf-8")
    workflow = (ROOT / ".github/workflows/portable-release.yml").read_text(encoding="utf-8")
    docker_workflow = (ROOT / ".github/workflows/docker-package.yml").read_text(encoding="utf-8")
    # Docker 只以镜像形式发布：由 docker-package.yml 推 GHCR，Release 里不再挂分发包，
    # Portable 发布链路也不再构建或归档它。
    if re.search(r"\$portableTargets\s*=\s*@\([^\n]*'docker'", release) or "ATO-Assistant-Docker-$versionText.zip" in release:
        failures.append("Portable 发布脚本不得再构建 Docker 分发包")
    if "ATO-Assistant-Docker-${{ steps.release.outputs.version }}.zip" in workflow:
        failures.append("Portable workflow 不得再归档 Docker 分发包")
    if "docker/build-push-action" not in docker_workflow or "ghcr.io/banard2049-cpu/ato_assistant" not in docker_workflow:
        failures.append("Docker 镜像仍必须由 docker-package.yml 推送到 GHCR")
    if "ATO-Assistant-Docker-${{ steps.release.outputs.version }}.zip" not in docker_workflow:
        failures.append("Docker 工作流仍应归档构建上下文 zip")
    return failures


if __name__ == "__main__":
    errors = run_installer_regressions()
    for error in errors:
        print(error)
    if not errors:
        print("Docker 安装行为测试通过（构建、启动、覆盖、更新及版本匹配）")
    raise SystemExit(bool(errors))
