"""Exercise Android LAN socket selection with a free and occupied preferred port."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def main():
    root = Path(__file__).resolve().parent.parent
    source = (root / "tools/packaging/android/app/src/main/java/com/ato/assistant/LocalSecondScreenServer.java").read_text(encoding="utf-8")
    assert "private static final int PREFERRED_PORT = 37403;" in source
    binding = re.search(r"      ServerSocket next;.*?(?=      serverSocket = next;)", source, re.S).group()
    helper = re.search(r"  private static ServerSocket bindSocket\(.*?\n  }", source, re.S).group()
    java_source = """
import java.io.IOException;
import java.net.*;
public class LanPortHarness {
  static ServerSocket select(int PREFERRED_PORT) throws IOException {
%s
    return next;
  }
%s
  public static void main(String[] args) throws Exception {
    int preferred;
    try (ServerSocket probe = bindSocket(0)) { preferred = probe.getLocalPort(); }
    try (ServerSocket selected = select(preferred)) {
      if (selected.getLocalPort() != preferred) throw new AssertionError("Preferred port not used");
    }
    try (ServerSocket blocker = bindSocket(preferred); ServerSocket selected = select(preferred)) {
      if (selected.getLocalPort() == preferred || selected.getLocalPort() == 0)
        throw new AssertionError("Occupied port did not fall back");
    }
    try (ServerSocket selected = select(preferred)) {
      if (selected.getLocalPort() != preferred) throw new AssertionError("Port not released");
    }
    System.out.println("Android LAN preferred-port and fallback checks passed");
  }
}
""" % (binding, helper)
    javac = shutil.which("javac")
    if not javac:
        java_root = Path(os.environ.get("JAVA_HOME", "C:/Program Files/Android/Android Studio/jbr"))
        javac = str(java_root / "bin" / ("javac.exe" if os.name == "nt" else "javac"))
    java = str(Path(javac).with_name("java.exe" if os.name == "nt" else "java"))
    with tempfile.TemporaryDirectory() as directory:
        file = Path(directory) / "LanPortHarness.java"
        file.write_text(java_source, encoding="utf-8")
        subprocess.run([javac, "-d", directory, str(file)], check=True)
        subprocess.run([java, "-cp", directory, "LanPortHarness"], check=True)


if __name__ == "__main__":
    main()
