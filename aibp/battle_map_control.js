(function () {
  const cycleOneApostles = new Set([
    "HEKATON",
    "LABYRINTHAUROS",
    "HERMESIAN_PURSUER",
    "ALPHA_TEMENOS",
  ]);
  const labyrinthTerrain = ["Labyrinth I", "Labyrinth L", "Labyrinth O", "Labyrinth Z"];
  const terrainPriorityByApostle = {
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
    const prioritized = [...new Set([...existing, ...apostlePriority])]
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
    const terrainSelect = root.querySelector("[data-battle-map-add-select]");
    const addButton = root.querySelector("[data-battle-map-add]");
    const rotateLeftButton = root.querySelector("[data-battle-map-rotate-left]");
    const rotateRightButton = root.querySelector("[data-battle-map-rotate-right]");
    const flipButton = root.querySelector("[data-battle-map-flip]");
    const deleteButton = root.querySelector("[data-battle-map-delete]");
    const resetButton = root.querySelector("[data-battle-map-reset]");
    const startsToggle = root.querySelector("[data-battle-map-starts-toggle]");
    const setupControl = root.querySelector("[data-battle-map-setup-control]");
    const setupSelect = root.querySelector("[data-battle-map-setup-select]");
    const selectionText = root.querySelector("[data-battle-map-selection]");
    const terrainCardList = root.querySelector("[data-battle-map-card-list]");
    const terrainCardCount = root.querySelector("[data-battle-map-card-count]");
    const terrainCardEmpty = root.querySelector("[data-battle-map-card-empty]");
    let selectedId = "";

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

    function renderStarts(map) {
      startLayer.replaceChildren();
      startLayer.hidden = map.showStarts === false;
      if (map.showStarts === false) return;
      const starts = window.BattleTerrain.getInitialPositions(
        options.getApostle(),
        map.startLevel,
        map.setupId
      );
      if (starts.apostle) {
        const marker = document.createElement("div");
        const arrow = document.createElement("span");
        const style = window.BattleTerrain.getTileStyle(starts.apostle);
        const facing = window.BattleTerrain.getInitialFacing(
          options.getApostle(),
          map.apostleFacing,
          map.setupId,
          map.startLevel
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

    function renderMap(map = ensureMap()) {
      renderSetupOptions(map);
      renderTerrainOptions(map);
      terrainLayer.replaceChildren();
      window.BattleTerrain.getMapTiles(map).forEach((placement) => {
        const button = document.createElement("button");
        const image = document.createElement("img");
        button.type = "button";
        button.className = `battle-map-terrain${placement.id === selectedId ? " selected" : ""}`;
        button.dataset.terrainId = placement.id;
        button.setAttribute("aria-label", placement.name);
        button.title = placement.name;
        applyPlacementStyle(button, placement);
        const sources = window.BattleTerrain.getAssetSources(placement, options.assetBase);
        image.src = sources[0];
        if (sources[1]) {
          image.addEventListener("error", () => {
            if (image.src !== sources[1]) image.src = sources[1];
          });
        }
        image.alt = "";
        image.style.transform = window.BattleTerrain.getTileFlipTransform(placement);
        button.appendChild(image);
        button.addEventListener("click", (event) => {
          if (selectedId !== placement.id) {
            event.stopPropagation();
            selectedId = placement.id;
            renderMap(map);
          }
        });
        terrainLayer.appendChild(button);
      });
      startsToggle.checked = map.showStarts !== false;
      renderStarts(map);
      renderSelection(map);
      renderTerrainCards(map);
    }

    function updateSelected(transform) {
      const map = ensureMap();
      const index = map.terrain.findIndex((item) => item.id === selectedId);
      if (index < 0) return;
      map.terrain[index] = transform({ ...map.terrain[index] });
      commit(map);
    }

    board.addEventListener("click", (event) => {
      if (!selectedId) return;
      const rect = board.getBoundingClientRect();
      const column = (event.clientX - rect.left) / rect.width * 20 + 0.5;
      const row = (rect.top + rect.height - event.clientY) / rect.height * 14 + 0.5;
      updateSelected((placement) => window.BattleTerrain.snapPlacement(placement, column, row));
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
