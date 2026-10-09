(function () {
  "use strict";
  function setup({ client, getContext, getItems, addItem, removeItem, renameItem, ready }) {
    const root = document.querySelector("#noteAttachments");
    const list = root.querySelector(".note-attachment-list");
    const status = root.querySelector(".note-attachment-status");
    const buttons = [...root.querySelectorAll("[data-attachment-pick]")];
    const addButton = root.querySelector(".note-attachment-add");
    const menu = root.querySelector(".note-attachment-menu");
    function closeMenu(focus = false) {
      menu.hidden = true;
      addButton.setAttribute("aria-expanded", "false");
      if (focus) addButton.focus();
    }
    function openMenu() {
      menu.hidden = false;
      addButton.setAttribute("aria-expanded", "true");
      buttons[0].focus();
    }
    addButton.addEventListener("click", () => { if (menu.hidden) openMenu(); else closeMenu(); });
    addButton.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openMenu(); }
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = buttons.indexOf(document.activeElement);
      const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index].focus();
    });
    document.addEventListener("click", (event) => {
      if (!root.querySelector(".note-attachment-actions").contains(event.target)) closeMenu();
    });
    document.addEventListener("focusin", (event) => {
      if (!root.querySelector(".note-attachment-actions").contains(event.target)) closeMenu();
    });
    const inputs = [...root.querySelectorAll('input[type="file"]')];
    const preview = document.querySelector("#noteAttachmentPreview");
    const previewImage = preview.querySelector("img");
    const previewTitle = preview.querySelector(".note-preview-title");
    const cache = new Map();
    let busy = false;
    let generation = 0;
    let lastContext = "";
    const cameraDialog = document.querySelector("#noteCameraDialog");
    const video = cameraDialog.querySelector("video");
    let cameraStream = null;
    let cameraRequest = 0;
    let cameraContext = null;
    function stopCamera() {
      cameraRequest++;
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      video.srcObject = null;
    }
    cameraDialog.querySelector("[data-camera-close]").addEventListener("click", () => cameraDialog.close());
    cameraDialog.addEventListener("close", stopCamera);
    window.addEventListener("pagehide", stopCamera);
    cameraDialog.querySelector("[data-camera-shoot]").addEventListener("click", async () => {
      if (!video.videoWidth || !ready() || contextKey(getContext()) !== cameraContext) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const capturedContext = cameraContext;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      cameraDialog.close();
      stopCamera();
      if (blob && ready() && contextKey(getContext()) === capturedContext) {
        void addFiles([new File([blob], "拍摄照片.jpg", { type: "image/jpeg" })]);
      }
    });
    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        message("当前浏览器无法调用摄像头，请使用 HTTPS 或本机地址，或从相册、文件添加照片。");
        return;
      }
      const request = ++cameraRequest;
      cameraContext = contextKey(getContext());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (request !== cameraRequest || !ready() || contextKey(getContext()) !== cameraContext) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStream = stream;
        video.srcObject = stream;
        cameraDialog.showModal();
      } catch (error) { stopCamera(); message("无法打开摄像头，请检查相机权限，或从相册、文件添加照片。"); }
    }
    const contextKey = (context) => `${context.account}:${context.cycle}`;
    const message = (text) => { status.textContent = text; };
    async function imageUrl(id) {
      const key = `${getContext().account}:${id}`;
      if (!cache.has(key)) {
        const pending = client.read(id).catch((error) => { cache.delete(key); throw error; });
        cache.set(key, pending);
        // Bound the preview cache; the persisted files remain available.
        if (cache.size > 40) cache.delete(cache.keys().next().value);
      }
      return cache.get(key);
    }
    function closePreview() {
      preview.close();
      previewImage.removeAttribute("src");
    }
    preview.querySelector("button").addEventListener("click", closePreview);
    preview.addEventListener("close", () => previewImage.removeAttribute("src"));
    preview.addEventListener("click", (event) => { if (event.target === preview) closePreview(); });
    function render() {
      const version = ++generation;
      const context = getContext();
      const key = contextKey(context);
      if (preview.open && key !== lastContext) closePreview();
      if (cameraDialog.open && key !== lastContext) { cameraDialog.close(); stopCamera(); }
      if (key !== lastContext || busy || !ready()) closeMenu();
      lastContext = key;
      list.replaceChildren();
      const entries = Object.entries(getItems(context) || {});
      root.querySelector(".note-attachment-empty").hidden = entries.length > 0;
      buttons.forEach((button) => { button.disabled = busy || !ready(); });
      addButton.disabled = busy || !ready();
      for (const [id, item] of entries) {
        if (!window.ATO_RECORD_ATTACHMENTS.validId(item?.blobId)) continue;
        const card = document.createElement("li");
        const open = document.createElement("button");
        open.type = "button";
        open.className = "note-attachment-open";
        open.title = `查看 ${item.name || "图片"}`;
        open.setAttribute("aria-label", `查看 ${item.name || "图片"}`);
        const img = document.createElement("img");
        img.alt = item.name || "图片附件";
        const caption = document.createElement("input");
        caption.type = "text";
        caption.className = "note-attachment-name";
        caption.value = item.name || "图片";
        caption.maxLength = 200;
        caption.title = "点击修改图片名称";
        caption.setAttribute("aria-label", "图片名称");
        caption.disabled = busy || !ready();
        caption.addEventListener("input", () => {
          const name = caption.value.trim();
          if (name && ready() && contextKey(getContext()) === key) {
            renameItem(context, id, name);
            open.title = `查看 ${name}`;
            open.setAttribute("aria-label", `查看 ${name}`);
            img.alt = name;
            remove.setAttribute("aria-label", `删除 ${name}`);
          }
        });
        caption.addEventListener("blur", () => { caption.value = caption.value.trim() || item.name || "图片"; });
        caption.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); caption.blur(); } });
        const info = document.createElement("span");
        info.className = "note-attachment-error";
        info.hidden = true;
        open.append(img);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "note-attachment-remove";
        remove.textContent = "删除";
        remove.disabled = busy || !ready();
        remove.setAttribute("aria-label", `删除 ${item.name || "图片"}`);
        remove.addEventListener("click", () => {
          if (contextKey(getContext()) !== key || !ready()) return;
          removeItem(context, id);
          message("已移除图片附件。");
          render();
        });
        let dataUrl;
        async function load() {
          info.hidden = true;
          try {
            const value = await imageUrl(item.blobId);
            if (version !== generation || contextKey(getContext()) !== key) return;
            dataUrl = value;
            img.src = value;
          } catch (error) {
            if (version === generation) { info.hidden = false; info.textContent = "读取失败，点击图片重试"; }
          }
        }
        open.addEventListener("click", async () => {
          if (!dataUrl) await load();
          if (!dataUrl || version !== generation || contextKey(getContext()) !== key || !ready()) return;
          previewImage.src = dataUrl;
          previewTitle.textContent = item.name || "图片附件";
          preview.showModal();
        });
        card.append(open, caption, info, remove);
        list.append(card);
        void load();
      }
    }
    async function addFiles(files) {
      if (busy || !files.length) return;
      if (!ready()) { message("请先登录并等待读取存档。"); return; }
      const context = getContext();
      busy = true;
      render();
      let added = 0;
      const errors = [];
      try {
        for (const file of files) {
          try {
            message(`正在保存 ${file.name || "照片"}…`);
            const dataUrl = await window.ATO_RECORD_ATTACHMENTS.compress(file);
            if (getContext().account !== context.account || !ready()) throw new Error("登录账号已切换，请刷新后重试。");
            const item = await client.upload(dataUrl);
            if (getContext().account !== context.account || !ready()) throw new Error("登录账号已切换，请刷新后重试。");
            addItem(context, `image-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
              ...item, name: String(file.name || "拍摄照片.jpg").slice(0, 200), createdAt: new Date().toISOString(),
            });
            added++;
          } catch (error) { errors.push(`${file.name || "图片"}：${error.message}`); }
        }
      } finally {
        busy = false;
        render();
        message([added ? `已添加 ${added} 张图片。` : "", ...errors].filter(Boolean).join("；"));
      }
    }
    buttons.forEach((button) => button.addEventListener("click", () => {
      closeMenu();
      if (button.dataset.attachmentPick === "noteCameraInput" && !window.ATOAndroid && !navigator.maxTouchPoints) {
        void openCamera();
        return;
      }
      root.querySelector(`#${button.dataset.attachmentPick}`).click();
    }));
    inputs.forEach((input) => input.addEventListener("change", () => {
      const files = [...input.files];
      input.value = "";
      void addFiles(files);
    }));
    root.addEventListener("dragover", (event) => { event.preventDefault(); });
    root.addEventListener("drop", (event) => {
      event.preventDefault();
      void addFiles([...event.dataTransfer.files]);
    });
    document.querySelector('[data-bind="notes"]').addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.items || [])].filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile()).filter(Boolean);
      if (files.length) { event.preventDefault(); void addFiles(files); }
    });
    return { render };
  }
  window.ATO_NOTE_ATTACHMENTS = { setup };
})();
