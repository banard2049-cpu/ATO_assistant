const $ = (id) => document.getElementById(id);

const state = {
  seq: 0,
  running: false,
  pollTimer: null,
  config: null,
};

function setStatus(text, kind = "") {
  const el = $("serverStatus");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function appendLog(lines) {
  if (!lines.length) return;
  const box = $("logBox");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = `${line}\n`;
    if (/❌|failed|失败|错误|error/i.test(line)) span.className = "err";
    else if (/✅|完成|Done|可用/.test(line)) span.className = "ok";
    box.appendChild(span);
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function fillVoices(voices) {
  const list = $("voiceList");
  list.innerHTML = "";
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.vcn;
    option.label = voice.label;
    list.appendChild(option);
  }
}

function fillStoryFiles(files) {
  const select = $("dataFileSelect");
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— 请选择 —";
  select.appendChild(placeholder);
  for (const file of files) {
    const option = document.createElement("option");
    option.value = file.path;
    option.textContent = `${file.path} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    select.appendChild(option);
  }
  const preferred = files.find((f) => /storybook-official-data\.js$/.test(f.path));
  if (preferred) {
    select.value = preferred.path;
    $("dataFileInput").value = preferred.path;
  }
}

function applyConfig(config) {
  state.config = config;
  $("engineSelect").value = config.engine || "online";
  $("appIdInput").value = config.appId || "";
  $("vcnInput").value = config.vcn || "";
  $("voiceLabelInput").value = config.voiceLabel || "";
  $("speedInput").value = config.speed ?? 50;
  $("volumeInput").value = config.volume ?? 50;
  $("pitchInput").value = config.pitch ?? 50;
  $("speedValue").textContent = config.speed ?? 50;
  $("volumeValue").textContent = config.volume ?? 50;
  $("pitchValue").textContent = config.pitch ?? 50;
  $("apiKeySaved").textContent = config.hasApiKey ? `已保存 ${config.apiKeyMasked}` : "未保存";
  $("apiSecretSaved").textContent = config.hasApiSecret ? `已保存 ${config.apiSecretMasked}` : "未保存";
}

function updateProgress(generated) {
  if (!generated) return;
  $("progressText").textContent = `已生成 ${generated.files} 个音频文件`;
  $("progressSize").textContent = `${(generated.bytes / 1024 / 1024).toFixed(1)} MB`;
}

function collectOptions() {
  return {
    dataPath: $("dataFileInput").value.trim() || $("dataFileSelect").value,
    fanDataPath: $("fanFileInput").value.trim(),
    outDir: $("outDirInput").value.trim(),
    book: $("bookSelect").value,
    limit: Number($("limitInput").value || 0),
    entry: $("entryInput").value.trim(),
    engine: $("engineSelect").value,
    vcn: $("vcnInput").value.trim(),
    includeBattle: $("includeBattle").checked,
    force: $("forceRegen").checked,
  };
}

function collectConfig() {
  return {
    engine: $("engineSelect").value,
    appId: $("appIdInput").value.trim(),
    apiKey: $("apiKeyInput").value.trim(),
    apiSecret: $("apiSecretInput").value.trim(),
    vcn: $("vcnInput").value.trim(),
    voiceLabel: $("voiceLabelInput").value.trim(),
    speed: Number($("speedInput").value),
    volume: Number($("volumeInput").value),
    pitch: Number($("pitchInput").value),
  };
}

async function post(route, body) {
  const response = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.error) throw new Error(`HTTP ${response.status}`);
  if (data.error && data.ok !== false) throw new Error(data.error);
  return data;
}

async function refreshState() {
  const response = await fetch("/api/state");
  const data = await response.json();
  fillVoices(data.voices || []);
  fillStoryFiles(data.storyFiles || []);
  applyConfig(data.config || {});
  $("outDirInput").value = $("outDirInput").value || data.outDir || "";
  updateProgress(data.generated);
  state.running = Boolean(data.running);
  setBusy(state.running);
  setStatus(state.running ? "生成中…" : "已连接", state.running ? "busy" : "ok");
  if (data.jobError) appendLog([`❌ ${data.jobError}`]);
}

function setBusy(running) {
  state.running = running;
  $("startBtn").disabled = running;
  $("stopBtn").disabled = !running;
  $("planBtn").disabled = running;
  $("testBtn").disabled = running;
  $("rebuildBtn").disabled = running;
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    try {
      const response = await fetch(`/api/logs?since=${state.seq}`);
      const data = await response.json();
      if (data.lines?.length) appendLog(data.lines);
      state.seq = data.seq ?? state.seq;
      updateProgress(data.generated);
      if (data.running !== state.running) {
        setBusy(data.running);
        setStatus(data.running ? "生成中…" : "已连接", data.running ? "busy" : "ok");
      }
      if (data.error && !data.running) {
        // 已由生成流程打印，避免重复
      }
    } catch {
      setStatus("连接已断开", "");
    }
  }, 600);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function runOneShot(route, payload, button) {
  button.disabled = true;
  try {
    const data = await post(route, payload);
    if (data.logs?.length) appendLog(data.logs);
    if (typeof data.seq === "number") state.seq = data.seq;
    setStatus(data.ok === false ? "执行失败" : "已连接", data.ok === false ? "" : "ok");
  } catch (error) {
    appendLog([`❌ ${String(error.message || error)}`]);
  } finally {
    button.disabled = false;
  }
}

function bindSlider(id, valueId) {
  const input = $(id);
  input.addEventListener("input", () => {
    $(valueId).textContent = input.value;
  });
}

bindSlider("speedInput", "speedValue");
bindSlider("volumeInput", "volumeValue");
bindSlider("pitchInput", "pitchValue");

$("dataFileSelect").addEventListener("change", (event) => {
  if (event.target.value) $("dataFileInput").value = event.target.value;
});

$("saveConfigBtn").addEventListener("click", async () => {
  try {
    await post("/api/save-config", collectConfig());
    $("apiKeyInput").value = "";
    $("apiSecretInput").value = "";
    appendLog(["✅ 账号与音色设置已保存到本机。"]);
    const response = await fetch("/api/state");
    applyConfig((await response.json()).config);
  } catch (error) {
    appendLog([`❌ 保存失败：${String(error.message || error)}`]);
  }
});

$("saveVoiceBtn").addEventListener("click", async () => {
  try {
    await post("/api/save-config", collectConfig());
    appendLog(["✅ 音色与参数已保存。"]);
  } catch (error) {
    appendLog([`❌ 保存失败：${String(error.message || error)}`]);
  }
});

$("testBtn").addEventListener("click", async () => {
  setStatus("测试中…", "busy");
  await runOneShot("/api/test", collectOptions(), $("testBtn"));
});

$("planBtn").addEventListener("click", async () => {
  setStatus("生成计划中…", "busy");
  await runOneShot("/api/plan", collectOptions(), $("planBtn"));
});

$("rebuildBtn").addEventListener("click", async () => {
  setStatus("重建中…", "busy");
  await runOneShot("/api/rebuild-manifest", collectOptions(), $("rebuildBtn"));
});

$("startBtn").addEventListener("click", async () => {
  try {
    setBusy(true);
    setStatus("生成中…", "busy");
    await post("/api/start", collectOptions());
    appendLog(["—— 开始批量生成 ——"]);
    startPolling();
  } catch (error) {
    setBusy(false);
    setStatus("已连接", "ok");
    appendLog([`❌ ${String(error.message || error)}`]);
  }
});

$("stopBtn").addEventListener("click", async () => {
  try {
    await post("/api/stop", {});
    appendLog(["已发送停止请求……"]);
  } catch (error) {
    appendLog([`❌ ${String(error.message || error)}`]);
  }
});

$("clearLogBtn").addEventListener("click", () => {
  $("logBox").innerHTML = "";
});

refreshState()
  .then(() => startPolling())
  .catch((error) => {
    setStatus("无法连接本地服务", "");
    appendLog([`❌ ${String(error.message || error)}`]);
  });
