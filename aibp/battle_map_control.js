(function () {
  const cycleOneApostles = new Set([
    "HEKATON",
    "LABYRINTHAUROS",
    "HERMESIAN_PURSUER",
    "ALPHA_TEMENOS",
  ]);
  const labyrinthTerrain = ["Labyrinth I", "Labyrinth L", "Labyrinth O", "Labyrinth Z"];
  const c3SpecialTerrain = ["Red Anchor", "Blue Anchor", "Green Anchor", "Yellow Anchor"];
  const terrainPriorityByApostle = {
    CHIMERA_METASTASIOS: c3SpecialTerrain,
    CYCLONUS: c3SpecialTerrain,
    HYPERTIME_ORACLE: c3SpecialTerrain,
    ICARIAN_HARPY: c3SpecialTerrain,
    SUN_DESCENDANT: c3SpecialTerrain,
    THE_BURDEN: c3SpecialTerrain,
    THE_NIETZSCHEAN: c3SpecialTerrain,
    THE_NIETZSCJEAN: c3SpecialTerrain,
    DAHAKA: [
      "Ambrosia Cloud", "Irem Tower", "Irem City", "Abandoned Temple",
      "Argo Hull 1x4", "Argo Hull 1x5",
    ],
    TITAN_X: [
      "Staircase Entrance",
      "Endless Staircase Track 1 1x5",
      "Endless Staircase Track 2 1x4",
      "Endless Staircase Track 3 1x4",
      "Endless Staircase Track 4 1x5",
      "Inkblot",
      "Trireme Graveyard",
      "School Of Creatures",
      "Windblighted Fleet",
      "Wishstorm",
    ],
  };

  function getTerrainOrder(map, apostle) {
    const catalogNames = Object.keys(window.BattleTerrain.catalog);
    const existing = (map?.terrain || []).map((placement) => placement.name);
    const normalizedApostle = String(apostle || "").toUpperCase();
    const apostlePriority = cycleOneApostles.has(normalizedApostle)
      ? labyrinthTerrain
      : (terrainPriorityByApostle[normalizedApostle] || []);
    const c3SpecialFirst = apostlePriority === c3SpecialTerrain;
    const prioritized = [...new Set(c3SpecialFirst
      ? [...apostlePriority, ...existing]
      : [...existing, ...apostlePriority])]
      .filter((name) => window.BattleTerrain.catalog[name]);
    const prioritizedSet = new Set(prioritized);
    return [
      ...prioritized,
      ...catalogNames.filter((name) => !prioritizedSet.has(name)).sort((a, b) => a.localeCompare(b)),
    ];
  }

  function create(options) {
    const root = options.root;
    const board = root.querySelector("[data-battle-map-board]");
    const terrainLayer = root.querySelector("[data-battle-map-terrain-layer]");
    const startLayer = root.querySelector("[data-battle-map-start-layer]");
    const coordinateLayer = root.querySelector("[data-battle-map-coordinate-layer]");
    const terrainSelect = root.querySelector("[data-battle-map-add-select]");
    const addButton = root.querySelector("[data-battle-map-add]");
    const rotateLeftButton = root.querySelector("[data-battle-map-rotate-left]");
    const rotateRightButton = root.querySelector("[data-battle-map-rotate-right]");
    const flipButton = root.querySelector("[data-battle-map-flip]");
    const deleteButton = root.querySelector("[data-battle-map-delete]");
    const resetButton = root.querySelector("[data-battle-map-reset]");
    const startsToggle = root.querySelector("[data-battle-map-starts-toggle]");
    const coordinatesToggle = root.querySelector("[data-battle-map-coordinates-toggle]");
    const setupControl = root.querySelector("[data-battle-map-setup-control]");
    const setupSelect = root.querySelector("[data-battle-map-setup-select]");
    const selectionText = root.querySelector("[data-battle-map-selection]");
    const terrainCardList = root.querySelector("[data-battle-map-card-list]");
    const terrainCardCount = root.querySelector("[data-battle-map-card-count]");
    const terrainCardEmpty = root.querySelector("[data-battle-map-card-empty]");
    const losLayer = root.querySelector("[data-battle-map-los-layer]");
    const losControl = root.querySelector("[data-battle-map-los-control]");
    const losToggle = root.querySelector("[data-battle-map-los-toggle]");
    const losBody = root.querySelector("[data-battle-map-los-body]");
    const losSourceSelect = root.querySelector("[data-battle-map-los-source]");
    const losHint = root.querySelector("[data-battle-map-los-hint]");
    const losStats = root.querySelector("[data-battle-map-los-stats]");
    const losReachInput = root.querySelector("[data-battle-map-los-reach]");
    const losReachField = root.querySelector("[data-battle-map-los-reach-field]");
    const losFacingSelect = root.querySelector("[data-battle-map-los-facing]");
    const losFacingField = root.querySelector("[data-battle-map-los-facing-field]");
    const losDimToggle = root.querySelector("[data-battle-map-los-dim]");
    const losElevatedToggle = root.querySelector("[data-battle-map-los-elevated]");
    const losRangeToggle = root.querySelector("[data-battle-map-los-range]");
    const losPathTools = root.querySelector("[data-battle-map-los-path-tools]");
    const losPathSourceButton = root.querySelector("[data-battle-map-los-path-source]");
    const losPathTargetButton = root.querySelector("[data-battle-map-los-path-target]");
    const losPathClearButton = root.querySelector("[data-battle-map-los-path-clear]");
    const losPathSummary = root.querySelector("[data-battle-map-los-path-summary]");
    let selectedId = "";
    // Line-of-sight UI state.
    //   source  "titan" = 1 格；"apostle" = 当前使徒，尺寸/盲区/移速都读自面板数据。
    //   reach   攻击距离，默认 1（贴身近战）；射程 = 移速 + 攻击距离。远程 AI 牌自行调大。
    //   facing  朝向（版图上画黄箭头，盲区取其反向）。null = 跟随该图的初始朝向。
    // 迷宫感应（仅迷宫机牛 / ALPHA_TEMENOS）不设开关：板面限定「对泰坦的视线」，而
    // 使徒能看的目标只有泰坦，这个条件恒成立，所以有此特性就无条件生效。
    // 高地(循环IV+)是**手动复选框 + 自动跟随**：泰坦踩上高地板块时自动勾选、移下自动取消，
    // 但玩家随时可以手动改（比如手动关掉、或给使徒手动开）。自动只在「跨越高地边界」的
    // 那一刻触发（边沿触发），平时不覆盖手动选择——见 syncAutoElevated。
    const losState = {
      active: false,
      source: "apostle",
      anchor: null,
      dim: true,
      // 大迷宫红线（含端点）永远遮挡视野，无开关。唯一例外是迷宫感应（整块剥离）。
      // 高地：无视遮蔽与红线（云层仍挡）。默认关，泰坦踩上高地自动勾、移下自动取消。
      elevated: false,
      showRange: true,
      reach: 1,
      facing: null,
      pathMode: "source",
      moveTarget: null,
    };

    function coordinateLabel(row, column) {
      return `${String.fromCharCode(64 + Number(row))}${Number(column)}`;
    }

    function currentMap() {
      return window.BattleTerrain.normalizeBattleMap(
        options.getMap(),
        options.getApostle(),
        options.getLevel()
      );
    }

    function sameMap(a, b) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    function ensureMap() {
      const original = options.getMap();
      const normalized = currentMap();
      if (!sameMap(original, normalized)) options.setMap(normalized);
      if (selectedId && !normalized.terrain.some((item) => item.id === selectedId)) selectedId = "";
      return normalized;
    }

    function commit(map) {
      options.setMap(map);
      renderMap(map);
    }

    function selectedPlacement(map) {
      return map.terrain.find((item) => item.id === selectedId) || null;
    }

    function renderTerrainOptions(map) {
      const previous = terrainSelect.value;
      const names = getTerrainOrder(map, options.getApostle());
      terrainSelect.replaceChildren();
      names.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        terrainSelect.appendChild(option);
      });
      terrainSelect.value = names.includes(previous) ? previous : (names[0] || "");
    }

    function renderSetupOptions(map) {
      const choices = window.BattleTerrain.getSetupOptions(options.getApostle());
      setupControl.hidden = choices.length < 2;
      setupSelect.replaceChildren();
      choices.forEach((choice) => {
        const option = document.createElement("option");
        option.value = choice.id;
        option.textContent = choice.label;
        setupSelect.appendChild(option);
      });
      setupSelect.value = choices.some((choice) => choice.id === map.setupId)
        ? map.setupId
        : (choices[0]?.id || "");
    }

    function applyPlacementStyle(element, placement) {
      const definition = window.BattleTerrain.catalog[placement.name];
      const style = window.BattleTerrain.getTileStyle({ ...definition, ...placement });
      element.style.left = style.left;
      element.style.top = style.top;
      element.style.width = style.width;
      element.style.height = style.height;
      element.style.transform = `translate(-50%, -50%) rotate(${style.rotation})`;
    }

    function setStyleProperty(element, name, value) {
      if (typeof element.style.setProperty === "function") element.style.setProperty(name, value);
      else element.style[name] = value;
    }

    function renderSpecialTerrain(button, placement) {
      const definition = window.BattleTerrain.catalog[placement.name] || {};
      const label = document.createElement("span");
      button.className += " special-terrain";
      setStyleProperty(button, "--battle-special-color", definition.color || "#f0c15d");
      setStyleProperty(button, "--battle-special-glow", definition.glow || "rgba(240, 193, 93, 0.5)");
      label.className = "battle-map-special-label";
      label.textContent = definition.label || placement.name.slice(0, 1);
      button.appendChild(label);
    }

    function renderStarts(map) {
      startLayer.replaceChildren();
      startLayer.hidden = map.showStarts === false;
      if (map.showStarts === false) return;
      const starts = window.BattleTerrain.getInitialPositions(
        options.getApostle(),
        map.startLevel,
        map.setupId,
        map.startPositionId
      );
      if (starts.apostle) {
        const marker = document.createElement("div");
        const arrow = document.createElement("span");
        const style = window.BattleTerrain.getTileStyle(starts.apostle);
        const facing = window.BattleTerrain.getInitialFacing(
          options.getApostle(),
          map.apostleFacing,
          map.setupId,
          map.startLevel,
          map.startPositionId
        );
        marker.className = "battle-map-start apostle";
        marker.textContent = "A";
        marker.title = `${options.getApostle().replaceAll("_", " ")} (${window.BattleTerrain.getFacingLabel(facing)})`;
        marker.style.left = style.left;
        marker.style.top = style.top;
        marker.style.width = style.width;
        marker.style.height = style.height;
        arrow.className = "battle-map-facing";
        arrow.textContent = "\u25b2";
        arrow.style.transform = `translate(-50%, -50%) rotate(${facing}deg) translateY(-1.05em)`;
        marker.appendChild(arrow);
        startLayer.appendChild(marker);
      }
      starts.titans.forEach((titan) => {
        const marker = document.createElement("div");
        marker.className = "battle-map-start titan";
        marker.textContent = titan.label;
        marker.style.left = `${(titan.column - 0.5) / 20 * 100}%`;
        marker.style.top = `${(14 - titan.row + 0.5) / 14 * 100}%`;
        marker.style.width = "5%";
        marker.style.height = `${100 / 14}%`;
        startLayer.appendChild(marker);
      });
    }

    function renderCoordinates(map) {
      if (!coordinateLayer) return;
      coordinateLayer.replaceChildren();
      coordinateLayer.hidden = map.showCoordinates !== true;
      if (coordinateLayer.hidden) return;
      for (let row = 14; row >= 1; row -= 1) {
        for (let column = 1; column <= 20; column += 1) {
          const cell = document.createElement("span");
          cell.className = "battle-map-coordinate";
          cell.textContent = coordinateLabel(row, column);
          cell.dataset.row = String(row);
          cell.dataset.column = String(column);
          coordinateLayer.appendChild(cell);
        }
      }
    }

    // ---- line of sight ---------------------------------------------------
    // 当前使徒的面板数据（尺寸/移速/盲点/特殊视线），按该图的初始等级取。
    function losProfile(map) {
      if (losState.source !== "apostle") return null;
      return window.BattleTerrain.getApostleProfile(options.getApostle(), map?.startLevel) || null;
    }

    // 来源脚印边长：泰坦固定 1 格，使徒直接读面板图示的尺寸。
    function losSourceSize(map) {
      const profile = losProfile(map);
      return profile ? profile.size : 1;
    }

    // 脚印中心 / 占格：实现在 battle_los.js，第二屏共用同一份，避免两边算出不同脚印。
    function losSourceCenter(map) {
      return window.BattleLOS.losSourceCenter(losState.anchor, losSourceSize(map));
    }

    function losSourceCells(map) {
      return window.BattleLOS.losSourceCells(losState.anchor, losSourceSize(map));
    }

    // 朝向：未手动指定时跟随该图的初始朝向（没有初始位置的图退回“上”）。
    // 盲区由它推出，所以改朝向盲区会自动跟着转。
    function losFacing(map) {
      if (losState.facing !== null) return losState.facing;
      const facing = window.BattleTerrain.getInitialFacing(
        options.getApostle(),
        map?.apostleFacing,
        map?.setupId,
        map?.startLevel,
        map?.startPositionId
      );
      return facing === null ? 0 : facing;
    }

    // P39：盲点与攀爬点永远都不视作在始徒的视线内。盲区 = 正后方紧贴脚印的一排。
    function losBlindspotCells(map) {
      const center = losSourceCenter(map);
      const profile = losProfile(map);
      if (!center || !profile || !profile.blindspot) return [];
      return window.BattleTerrain.getBlindspotCells(
        options.getApostle(),
        map?.startLevel,
        center,
        losFacing(map)
      );
    }

    // 迷宫感应此刻是否真的在生效：使徒带这个特性，且图上真有大迷宫。泰坦来源没有
    // 使徒特性，自然不适用。
    function losMazesenseActive(map, occ) {
      const profile = losProfile(map);
      if (!profile || !profile.mazesense) return false;
      const model = occ || lastOcc;
      return !!(model && model.labyrinthTiles && model.labyrinthTiles.size);
    }

    // Last occluder model built by renderLos — renderLosControl runs right after
    // and uses it to tell the player when the chosen source sits on high ground.
    let lastOcc = null;
    let lastOverlay = null;
    // 上一次判定「泰坦是否站在高地格上」的结果，用来做边沿触发：只有从「不在」变「在」
    // （或反过来）的那一刻才自动改复选框，平时不动，这样玩家的手动选择能保留。
    let lastOnHigh = false;

    // 泰坦是否站在高地板块格上（使徒不吃高地，恒 false）。
    function sourceOnHighGround(map) {
      if (losState.source !== "titan") return false;
      const occ = lastOcc;
      if (!occ || !occ.elevated || !occ.elevated.size) return false;
      return losSourceCells(map).some(({ c, r }) => occ.elevated.has(`${c},${r}`));
    }

    // 边沿触发的自动勾选：泰坦踩上高地 → 自动勾；移下 → 自动取消。只在跨越边界时改，
    // 不覆盖玩家在「同一格状态」下的手动切换。返回 true 表示 losState.elevated 被改动。
    function syncAutoElevated(map) {
      const onHigh = sourceOnHighGround(map);
      let changed = false;
      if (onHigh !== lastOnHigh) {
        // 跨越了高地边界：跟着地形自动设成对应值。
        if (losState.elevated !== onHigh) { losState.elevated = onHigh; changed = true; }
        lastOnHigh = onHigh;
      }
      return changed;
    }

    // 计算与绘制都在 battle_los.js，第二屏调同一对函数，所以两屏逐格一致。
    function renderLos(map) {
      if (!losLayer || !window.BattleLOS) return;
      // 先建一次拿到 occ，据此判断是否跨越高地边界；若自动改了 elevated，重建一次再画。
      let overlay = window.BattleLOS.buildLosOverlay(
        map, losState, window.BattleTerrain, options.getApostle());
      lastOcc = overlay.occ;
      if (syncAutoElevated(map)) {
        overlay = window.BattleLOS.buildLosOverlay(
          map, losState, window.BattleTerrain, options.getApostle());
        lastOcc = overlay.occ;
      }
      lastOverlay = overlay;
      window.BattleLOS.renderLosOverlay(losLayer, overlay);
    }

    function speedLabel(speed) {
      if (speed === Infinity) return "∞";
      if (!Number.isFinite(speed)) return "—";
      return String(speed);
    }

    function formatMoveFacing(value) {
      return ({ 0: "上", 90: "右", 180: "下", 270: "左" })[
        ((Number(value) % 360) + 360) % 360
      ] || "上";
    }

    function stopReasonLabel(reason) {
      return ({
        "already-in-range": "已在攻击距离内",
        "in-range": "进入攻击距离",
        "speed-limit": "移速用尽",
        "speed-zero": "不可移动",
        "already-there": "已在指定地点",
        destination: "到达指定地点",
      })[reason] || reason || "已停止";
    }

    function footprintLabel(cells) {
      return (cells || [])
        .map(({ c, r }) => coordinateLabel(r, c))
        .join("/");
    }

    function pathSummaryLine(title, paths) {
      if (!paths || !paths.length) return `${title}: 无路径`;
      return `${title}: ${paths.map((path, index) =>
        `${index + 1}.${path.label} ${path.steps}步，终点${footprintLabel(path.finalFootprint)}，朝${formatMoveFacing(path.facing)}，${stopReasonLabel(path.stopReason)}`
      ).join("；")}`;
    }

    function renderPathSummary(map) {
      if (!losPathSummary) return;
      const profile = losProfile(map);
      const movement = lastOverlay?.movement;
      if (!losState.active || !profile || !losState.anchor || !movement) {
        losPathSummary.hidden = true;
        losPathSummary.textContent = "";
        return;
      }
      losPathSummary.hidden = false;
      losPathSummary.textContent = [
        `目标 ${coordinateLabel(movement.target.r, movement.target.c)}`,
        pathSummaryLine("规则停下", movement.rules),
        pathSummaryLine("直达指定地点", movement.direct),
      ].join(" · ");
    }

    // 面板数据一行：尺寸 / 移速 / 攻击距离 / 射程，并注明盲区与特殊视线。
    function renderLosStats(map) {
      if (!losStats) return;
      const profile = losProfile(map);
      if (!profile) {
        losStats.hidden = true;
        return;
      }
      losStats.hidden = false;
      const name = options.getApostle().replaceAll("_", " ");
      const parts = [
        `${name} ${profile.size}×${profile.size}`,
        `移速 ${speedLabel(profile.speed)}`,
        `攻击距离 ${losState.reach}`,
      ];
      if (profile.speed === Infinity) parts.push("射程 全图");
      else parts.push(`射程 ${profile.speed + losState.reach} 格`);
      // 朝向 0/90/180/270 = 上/右/下/左，后方即其反向。朝向对每个使徒都标（版图上
      // 有黄箭头），盲区只有带这个特性的才有。
      const face = { 0: "上", 90: "右", 180: "下", 270: "左" }[losFacing(map)] || "上";
      const rear = { 0: "下", 90: "左", 180: "上", 270: "右" }[losFacing(map)] || "下";
      parts.push(`朝${face}`);
      if (profile.blindspot) parts.push(`盲区 ${rear}方 ${profile.size} 格`);
      if (profile.alwaysLos) parts.push("总是有视线");
      if (profile.mazesense) parts.push("迷宫感应（无视大迷宫）");
      losStats.textContent = parts.join(" · ");
    }

    function renderLosControl(map) {
      if (!losToggle) return;
      const profile = losProfile(map);
      losToggle.setAttribute("aria-pressed", losState.active ? "true" : "false");
      losToggle.textContent = losState.active ? "关闭" : "开启";
      if (losBody) losBody.hidden = !losState.active;
      if (losSourceSelect) {
        // 使徒那一项的标签跟着当前使徒的面板尺寸走。
        const apostleOption = losSourceSelect.querySelector('option[value="apostle"]');
        if (apostleOption) {
          const size = window.BattleTerrain.getApostleProfile(options.getApostle(), map?.startLevel)?.size;
          apostleOption.textContent = size ? `使徒（${size}×${size}）` : "使徒";
        }
        losSourceSelect.value = losState.source;
      }
      if (losReachField) losReachField.hidden = !profile;
      if (losReachInput) losReachInput.value = String(losState.reach);
      // 朝向对**任何**使徒都要显示：箭头是常驻标注，不再只服务于盲区。
      // 泰坦没有朝向（单格、无盲区、面板也没印），仍然隐藏。
      if (losFacingField) losFacingField.hidden = !profile;
      if (losFacingSelect) losFacingSelect.value = losState.facing === null ? "auto" : String(losState.facing);
      if (losDimToggle) losDimToggle.checked = losState.dim;
      if (losElevatedToggle) losElevatedToggle.checked = losState.elevated;
      // 没有高地时隐藏高地按钮。
      if (losElevatedToggle && typeof losElevatedToggle.closest === "function") {
        const hasElevated = !!(lastOcc && lastOcc.elevated && lastOcc.elevated.size);
        const wrap = losElevatedToggle.closest("label");
        if (wrap) wrap.hidden = !hasElevated;
      }
      if (losRangeToggle) {
        // 不再按 profile 禁用：泰坦没有面板数据、画不出射程框，但距离数字照样有用。
        losRangeToggle.checked = losState.showRange;
      }
      if (losPathTools) losPathTools.hidden = !profile;
      if (losPathSourceButton) losPathSourceButton.setAttribute("aria-pressed", losState.pathMode === "source" ? "true" : "false");
      if (losPathTargetButton) {
        losPathTargetButton.disabled = !losState.anchor;
        losPathTargetButton.setAttribute("aria-pressed", losState.pathMode === "target" ? "true" : "false");
      }
      if (losPathClearButton) losPathClearButton.disabled = !losState.moveTarget;
      renderLosStats(map);
      renderPathSummary(map);
      if (losHint) {
        // 高地是手动开关；泰坦踩上/移下高地会自动帮玩家勾选/取消（syncAutoElevated）。
        const onHigh = sourceOnHighGround(map);
        const hasCloud = !!(lastOcc && lastOcc.cloud && lastOcc.cloud.size);
        const notes = [];
        if (losState.elevated) {
          const auto = onHigh ? "（泰坦位于高地板块，已自动勾选）" : "（手动开启）";
          notes.push(hasCloud
            ? `高地${auto}：无视其他遮蔽地形与红线；云层地形（蓝框）例外，仍然遮挡。`
            : `高地${auto}：无视全部遮蔽地形与红线，视线不被地形阻挡。`);
        } else if (onHigh) {
          // 泰坦在高地格但被手动取消了：尊重手动选择，只提示可勾选。
          notes.push("泰坦位于高地板块，可勾选「高地」以无视遮蔽与红线（已被手动取消）。");
        } else if (profile && lastOcc && lastOcc.elevated && lastOcc.elevated.size
          && losSourceCells(map).some(({ c, r }) => lastOcc.elevated.has(`${c},${r}`))) {
          // 使徒踩在高地板块上：规则里高地只对泰坦生效。
          notes.push("来源所在板块带高地关键词，但高地（循环Ⅳ+）规则只对泰坦生效。");
        }
        notes.push(losState.anchor
          ? (profile
            ? "点击版图选择目标格，红/黄=两条可选移动路径会路过的格子，橙色=两条路线重叠；绿色=有视线，暗红=被遮挡。"
            : "绿色=有视线，红色=被遮挡。")
          : "点击版图选择来源位置，绿色为有视线，红色为被遮挡。");
        if (losState.showRange) {
          if (!profile) {
            notes.push("格内数字=到来源的正交距离（泰坦无面板数据，不画射程层）。");
          } else if (profile.speed === Infinity) {
            notes.push("移速 ∞，全图都在射程内，故不画射程层；格内数字=到来源的正交距离。");
          } else if (profile.speed === 0) {
            notes.push("该使徒不可移动，射程只有攻击距离（紫框）；格内数字=到来源的正交距离。");
          } else {
            notes.push("紫框=移动后能攻击到的格子；格内数字=到来源的正交距离。");
          }
        }
        if (profile) {
          notes.push(profile.blindspot
            ? "黄箭头=朝向，斜纹格=盲区（在朝向的反向），永远不算有视线。"
            : "黄箭头=朝向；该使徒没有盲区。");
        }
        if (profile && profile.mazesense) {
          notes.push(losMazesenseActive(map, lastOcc)
            ? "迷宫感应生效：虚线红线不遮挡。"
            : "迷宫感应：本图没有大迷宫板块，无从生效。");
        }
        losHint.textContent = notes.join("");
      }
    }

    function renderSelection(map) {
      const selected = selectedPlacement(map);
      const disabled = !selected;
      rotateLeftButton.disabled = disabled;
      rotateRightButton.disabled = disabled;
      flipButton.disabled = disabled;
      deleteButton.disabled = disabled;
      flipButton.setAttribute("aria-pressed", selected?.flipped ? "true" : "false");
      if (!selected) {
        selectionText.textContent = "未选择地形";
        return;
      }
      selectionText.replaceChildren();
      const name = document.createElement("strong");
      name.textContent = selected.name;
      const coordinates = document.createElement("span");
      coordinates.textContent = `R${selected.row} C${selected.column} · ${selected.rotation}°${selected.flipped ? " · 反面" : ""}`;
      selectionText.append(name, coordinates);
    }

    function renderTerrainCards(map) {
      const cards = window.BattleTerrain.getTerrainCards(map, options.cardAssetBase);
      terrainCardList.replaceChildren();
      terrainCardCount.textContent = `${cards.length} 张`;
      terrainCardEmpty.hidden = cards.length > 0;
      cards.forEach((card) => {
        const button = document.createElement("button");
        const image = document.createElement("img");
        const label = document.createElement("span");
        button.type = "button";
        button.className = "battle-map-card";
        button.title = `${card.label} - 点击查看大图`;
        button.setAttribute("aria-label", `查看 ${card.label} 地形卡`);
        image.src = card.src;
        image.alt = card.label;
        image.loading = "lazy";
        label.textContent = card.label;
        button.append(image, label);
        if (typeof options.openImageZoom === "function") {
          button.addEventListener("click", () => options.openImageZoom(card.src, card.label));
        }
        terrainCardList.appendChild(button);
      });
    }

    function renderLightCoverage(map) {
      const coverage = window.BattleTerrain.getLightCoverage(map);
      coverage.cells.forEach(({ c, r, sources }) => {
        const light = document.createElement("div");
        light.className = "battle-map-light-range";
        light.title = `光照 1：${sources.join("、")}`;
        light.style.left = `${(c - 1) / 20 * 100}%`;
        light.style.top = `${(14 - r) / 14 * 100}%`;
        light.style.width = `${100 / 20}%`;
        light.style.height = `${100 / 14}%`;
        terrainLayer.appendChild(light);
      });
    }

    function renderMap(map = ensureMap()) {
      renderSetupOptions(map);
      renderTerrainOptions(map);
      terrainLayer.replaceChildren();
      board.classList?.toggle("coordinates-visible", map.showCoordinates === true);
      window.BattleTerrain.getMapTiles(map).forEach((placement) => {
        const button = document.createElement("button");
        const definition = window.BattleTerrain.catalog[placement.name] || {};
        button.type = "button";
        button.className = `battle-map-terrain${placement.id === selectedId ? " selected" : ""}`;
        button.dataset.terrainId = placement.id;
        button.setAttribute("aria-label", placement.name);
        button.title = placement.name;
        applyPlacementStyle(button, placement);
        if (definition.special && !definition.file) {
          renderSpecialTerrain(button, placement);
        } else {
          const image = document.createElement("img");
          const sources = window.BattleTerrain.getAssetSources(placement, options.assetBase);
          image.src = sources[0] || "";
          if (sources[1]) {
            image.addEventListener("error", () => {
              if (image.src !== sources[1]) image.src = sources[1];
            });
          }
          image.alt = "";
          image.style.transform = window.BattleTerrain.getTileFlipTransform(placement);
          button.appendChild(image);
        }
        button.addEventListener("click", (event) => {
          if (selectedId !== placement.id) {
            event.stopPropagation();
            selectedId = placement.id;
            renderMap(map);
          }
        });
        button.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!selectedId) return;
          selectedId = "";
          renderMap(map);
        });
        terrainLayer.appendChild(button);
      });
      renderLightCoverage(map);
      startsToggle.checked = map.showStarts !== false;
      if (coordinatesToggle) {
        const showCoordinates = map.showCoordinates === true;
        coordinatesToggle.setAttribute("aria-pressed", showCoordinates ? "true" : "false");
        coordinatesToggle.textContent = showCoordinates ? "隐藏坐标" : "显示坐标";
      }
      renderStarts(map);
      renderCoordinates(map);
      renderSelection(map);
      renderTerrainCards(map);
      renderLos(map);
      renderLosControl(map);
    }

    function updateSelected(transform) {
      const map = ensureMap();
      const index = map.terrain.findIndex((item) => item.id === selectedId);
      if (index < 0) return;
      map.terrain[index] = transform({ ...map.terrain[index] });
      commit(map);
    }

    // losState 不在 battleMap 里，所以它的改动不会经过 commit()/setMap()，得单独通知
    // 一次，否则第二屏要等下一次抽卡之类的操作才跟着变。
    function renderLosAndNotify() {
      renderMap(ensureMap());
      options.onLosChange?.();
    }

    board.addEventListener("click", (event) => {
      const rect = board.getBoundingClientRect();
      const column = (event.clientX - rect.left) / rect.width * 20 + 0.5;
      const row = (rect.top + rect.height - event.clientY) / rect.height * 14 + 0.5;
      // In LoS mode, a board click sets the source anchor instead of moving terrain.
      if (losState.active) {
        const profile = losProfile(ensureMap());
        if (!profile || losState.pathMode === "source" || !losState.anchor) {
          losState.anchor = { column, row };
          losState.moveTarget = null;
          losState.pathMode = profile ? "target" : "source";
        } else {
          losState.moveTarget = { column, row };
          losState.pathMode = "target";
        }
        renderLosAndNotify();
        return;
      }
      if (!selectedId) return;
      updateSelected((placement) => window.BattleTerrain.snapPlacement(placement, column, row));
    });

    losToggle?.addEventListener("click", () => {
      losState.active = !losState.active;
      if (!losState.active) {
        losState.anchor = null;
        losState.moveTarget = null;
        losState.pathMode = "source";
      }
      renderLosAndNotify();
    });

    losSourceSelect?.addEventListener("change", () => {
      losState.source = losSourceSelect.value;
      losState.moveTarget = null;
      losState.pathMode = "source";
      renderLosAndNotify();
    });

    losDimToggle?.addEventListener("change", () => {
      losState.dim = losDimToggle.checked;
      renderLosAndNotify();
    });

    // 高地是手动开关，但自动跟随泰坦位置。玩家手动切换时同步 lastOnHigh，避免下一次
    // 重绘（还没跨越边界）又把手动选择覆盖掉。
    losElevatedToggle?.addEventListener("change", () => {
      losState.elevated = losElevatedToggle.checked;
      lastOnHigh = sourceOnHighGround(ensureMap());
      renderLosAndNotify();
    });

    losRangeToggle?.addEventListener("change", () => {
      losState.showRange = losRangeToggle.checked;
      renderLosAndNotify();
    });

    // 攻击距离：近战填 1，远程 AI 牌按牌面写的距离填。
    losReachInput?.addEventListener("input", () => {
      const value = Math.round(Number(losReachInput.value));
      losState.reach = Number.isFinite(value) ? Math.min(20, Math.max(0, value)) : 1;
      renderLosAndNotify();
    });

    losFacingSelect?.addEventListener("change", () => {
      const value = losFacingSelect.value;
      losState.facing = value === "auto" ? null : Number(value);
      renderLosAndNotify();
    });

    losPathSourceButton?.addEventListener("click", () => {
      losState.pathMode = "source";
      renderLosAndNotify();
    });

    losPathTargetButton?.addEventListener("click", () => {
      if (!losState.anchor) return;
      losState.pathMode = "target";
      renderLosAndNotify();
    });

    losPathClearButton?.addEventListener("click", () => {
      losState.moveTarget = null;
      losState.pathMode = losState.anchor ? "target" : "source";
      renderLosAndNotify();
    });

    rotateLeftButton.addEventListener("click", () => {
      updateSelected((placement) => {
        const rotated = { ...placement, rotation: (placement.rotation + 270) % 360 };
        return window.BattleTerrain.snapPlacement(rotated, rotated.column, rotated.row);
      });
    });

    rotateRightButton.addEventListener("click", () => {
      updateSelected((placement) => {
        const rotated = { ...placement, rotation: (placement.rotation + 90) % 360 };
        return window.BattleTerrain.snapPlacement(rotated, rotated.column, rotated.row);
      });
    });

    flipButton.addEventListener("click", () => {
      updateSelected((placement) => ({ ...placement, flipped: !placement.flipped }));
    });

    deleteButton.addEventListener("click", () => {
      const map = ensureMap();
      map.terrain = map.terrain.filter((item) => item.id !== selectedId);
      selectedId = "";
      commit(map);
    });

    addButton.addEventListener("click", () => {
      const map = ensureMap();
      const name = terrainSelect.value;
      if (!window.BattleTerrain.catalog[name]) return;
      const placement = window.BattleTerrain.snapPlacement({
        id: `terrain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        row: 7.5,
        column: 10.5,
        rotation: 180,
        flipped: false,
      }, 10.5, 7.5);
      map.terrain.push(placement);
      selectedId = placement.id;
      commit(map);
    });

    startsToggle.addEventListener("change", () => {
      const map = ensureMap();
      map.showStarts = startsToggle.checked;
      commit(map);
    });

    coordinatesToggle?.addEventListener("click", () => {
      const map = ensureMap();
      map.showCoordinates = map.showCoordinates !== true;
      commit(map);
    });

    setupSelect.addEventListener("change", () => {
      selectedId = "";
      commit(window.BattleTerrain.createBattleMap(
        options.getApostle(),
        options.getLevel(),
        setupSelect.value
      ));
    });

    resetButton.addEventListener("click", () => {
      selectedId = "";
      commit(window.BattleTerrain.createBattleMap(
        options.getApostle(),
        options.getLevel(),
        setupControl.hidden ? undefined : setupSelect.value
      ));
    });

    return {
      render() { renderMap(); },
      // 第二屏要画同样的标注，但 losState 不属于 battleMap（不该写进存档），所以单独
      // 导出一份可序列化快照，由 index.html 塞进第二屏 payload 的 los 字段。
      getLosSnapshot() {
        if (!losState.active) return { active: false };
        return {
          active: true,
          source: losState.source,
          anchor: losState.anchor
            ? { column: losState.anchor.column, row: losState.anchor.row }
            : null,
          dim: losState.dim,
          // elevated 进快照：主屏（含自动勾选的结果）是唯一真相，第二屏照搬即可，
          // 不在引擎里按位置重算，这样两屏永远一致、也尊重玩家的手动选择。
          elevated: losState.elevated,
          showRange: losState.showRange,
          reach: losState.reach,
          facing: losState.facing,
          moveTarget: losState.moveTarget
            ? { column: losState.moveTarget.column, row: losState.moveTarget.row }
            : null,
        };
      },
      reset() {
        selectedId = "";
        commit(window.BattleTerrain.createBattleMap(
          options.getApostle(),
          options.getLevel(),
          setupControl.hidden ? undefined : setupSelect.value
        ));
      },
    };
  }

  window.BattleMapControl = { create, getTerrainOrder };
})();
