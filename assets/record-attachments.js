(function () {
  "use strict";
  const MAX_BYTES = 768 * 1024;
  const validId = (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
  function references(record) {
    const found = new Set();
    function visit(value) {
      if (!value || typeof value !== "object") return;
      if (value.noteAttachments && typeof value.noteAttachments === "object") {
        Object.values(value.noteAttachments).forEach((item) => {
          if (!validId(item?.blobId)) throw new Error("存档中的图片附件引用无效。");
          found.add(item.blobId);
        });
      }
      ["users", "accounts", "cycleStats"].forEach((key) => {
        if (value[key] && typeof value[key] === "object") Object.values(value[key]).forEach(visit);
      });
    }
    visit(record);
    return [...found];
  }
  function createClient(url, accountId, accept = (value) => value) {
    async function request(action, body, id) {
      const account = accountId();
      if (!account) throw new Error("请先登录并等待读取存档后再添加图片。");
      const params = new URLSearchParams({ action, expectedAccountId: account });
      if (id) params.set("id", id);
      const response = await fetch(`${url}?${params}`, body ? {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedAccountId: account }),
      } : { cache: "no-store" });
      const payload = accept(await response.json());
      if (accountId() !== account || (payload?.user?.id && payload.user.id !== account)) throw new Error("登录账号已切换，请刷新后重试。");
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (payload?.user?.id !== account) throw new Error("无法确认图片附件所属账号，请刷新后重试。");
      return payload;
    }
    const read = async (id) => {
      if (!validId(id)) throw new Error("图片附件引用无效。");
      return (await request("record-attachment", null, id)).dataUrl;
    };
    const upload = async (dataUrl) => (await request("record-attachment", { dataUrl })).attachment;
    async function exportBlobs(record) {
      const blobs = {};
      for (const id of references(record)) blobs[id] = await read(id);
      return blobs;
    }
    async function restoreBlobs(record, blobs) {
      const ids = references(record);
      // Validate the entire manifest before making any uploads. Old backups without
      // references need no image section. Images never enter the campaign POST body.
      if (ids.length && (!blobs || typeof blobs !== "object" || Array.isArray(blobs))) {
        throw new Error("存档缺少图片附件，无法恢复。请使用包含附件的完整备份。");
      }
      for (const id of ids) {
        const value = blobs[id];
        if (typeof value !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
          || value.length > MAX_BYTES * 4 / 3 + 64) throw new Error("存档中的图片附件缺失或无效。");
      }
      for (const id of ids) {
        const saved = await upload(blobs[id]);
        if (saved.blobId !== id) throw new Error("图片附件校验失败，存档未导入。");
      }
    }
    return { read, upload, exportBlobs, restoreBlobs };
  }
  async function compress(file) {
    if (!file || file.size > 32 * 1024 * 1024) throw new Error("请选择不超过 32 MB 的图片。");
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("无法读取这张图片，请改用 JPG、PNG 或 WebP 格式。"));
        img.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error("图片尺寸无效。");
      let scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      for (let attempt = 0; attempt < 7; attempt++) {
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
        if (!blob) throw new Error("无法处理图片，请重新选择。");
        if (blob.size <= MAX_BYTES) return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("读取图片失败。"));
          reader.readAsDataURL(blob);
        });
        scale *= 0.75;
      }
      throw new Error("图片压缩后仍然过大，请裁剪后重试。");
    } finally { URL.revokeObjectURL(url); }
  }
  window.ATO_RECORD_ATTACHMENTS = { createClient, references, compress, validId, MAX_BYTES };
})();
