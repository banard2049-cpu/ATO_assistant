"""Small client for the official, local ADB server used by debug_android.py.

Keeping the client in Python also avoids a Windows extension DLL that crashes
adb.exe clients on this development computer. The Android SDK still supplies
the ADB server and the emulator; no phone or remote server is contacted.
"""
from __future__ import annotations

import socket
import struct
import subprocess
import time
from pathlib import Path


def read_exact(stream: socket.socket, size: int) -> bytes:
    parts = bytearray()
    while len(parts) < size:
        part = stream.recv(size - len(parts))
        if not part:
            raise RuntimeError("ADB connection closed unexpectedly")
        parts.extend(part)
    return bytes(parts)


def request(stream: socket.socket, service: str) -> None:
    payload = service.encode("utf-8")
    stream.sendall(f"{len(payload):04x}".encode("ascii") + payload)
    status = read_exact(stream, 4)
    if status != b"OKAY":
        if status == b"FAIL":
            length = int(read_exact(stream, 4), 16)
            raise RuntimeError(read_exact(stream, length).decode("utf-8", errors="replace"))
        raise RuntimeError(f"Unexpected ADB status: {status!r}")


class LocalAdb:
    def __init__(self, executable: Path, serial: str = "emulator-5554") -> None:
        self.serial = serial
        try:
            with self.connect():
                pass
        except OSError:
            # The daemon can start successfully even if an injected Windows DLL
            # then crashes the CLI at exit. Verify the actual server connection.
            result = subprocess.run([str(executable), "start-server"], capture_output=True,
                                    text=True, timeout=30)
            try:
                with self.connect():
                    pass
            except OSError as error:
                raise RuntimeError("Cannot start local ADB server: " + result.stderr) from error

    def connect(self) -> socket.socket:
        return socket.create_connection(("127.0.0.1", 5037), timeout=30)

    def device(self) -> socket.socket:
        stream = self.connect()
        try:
            request(stream, "host:transport:" + self.serial)
        except Exception:
            stream.close()
            raise
        return stream

    def shell(self, command: str) -> str:
        output = bytearray()
        errors = bytearray()
        with self.device() as stream:
            request(stream, "shell,v2,raw:" + command)
            while True:
                channel, size = struct.unpack("<BI", read_exact(stream, 5))
                payload = read_exact(stream, size)
                if channel == 1:
                    output.extend(payload)
                elif channel == 2:
                    errors.extend(payload)
                elif channel == 3:
                    code = int.from_bytes(payload, "little")
                    if code:
                        raise RuntimeError(f"Android command failed ({code}): " +
                                           (errors + output).decode("utf-8", errors="replace"))
                    return output.decode("utf-8", errors="replace")

    def execute(self, service: str, input_file: Path | None = None) -> bytes:
        output = bytearray()
        with self.device() as stream:
            request(stream, service)
            if input_file:
                with input_file.open("rb") as source:
                    while data := source.read(1024 * 1024):
                        stream.sendall(data)
            while part := stream.recv(65536):
                output.extend(part)
        return bytes(output)

    def install(self, apk: Path) -> str:
        result = self.execute(f"exec:cmd package install -r -S {apk.stat().st_size}", apk)
        message = result.decode("utf-8", errors="replace")
        if "Success" not in message.splitlines():
            raise RuntimeError("APK installation failed: " + message)
        return message

    def push(self, source: Path, destination: str) -> None:
        with self.device() as stream:
            request(stream, "sync:")
            target = (destination + ",33188").encode("utf-8")
            stream.sendall(struct.pack("<4sI", b"SEND", len(target)) + target)
            with source.open("rb") as file:
                while chunk := file.read(65536):
                    stream.sendall(struct.pack("<4sI", b"DATA", len(chunk)) + chunk)
            stream.sendall(struct.pack("<4sI", b"DONE", int(time.time())))
            status, size = struct.unpack("<4sI", read_exact(stream, 8))
            if status != b"OKAY":
                raise RuntimeError("ADB push failed: " + read_exact(stream, size).decode("utf-8", errors="replace"))

    def forward(self, local: str, remote: str) -> None:
        with self.connect() as stream:
            request(stream, f"host-serial:{self.serial}:forward:{local};{remote}")
            if read_exact(stream, 4) != b"OKAY":
                raise RuntimeError("ADB port forwarding failed")
