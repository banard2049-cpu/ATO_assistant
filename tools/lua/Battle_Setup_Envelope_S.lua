function onload()
  -- clickable area
  self.createButton({
      click_function="pitilessBattle", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function pitilessBattle()
  broadcastToAll("Pitiless Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local cityPositions = {
    -- 3 different cities
    {-22.05, 1.30, 21.30},
    {-40.05, 1.30, 5.29},
    {-16.04, 1.30, 5.27}
  }
  local labyrinthOPositions = {
    -- 0
    {-39.02, 1.30, 26.30}
  }
  local labyrinthIPositions = {
    -- 270
    {-40.02, 1.30, 16.30}
  }
  local labyrinthZPositions = {
    -- 0
    {-34.04, 1.30, 12.32}
  }
  local labyrinthLPositions = {
    -- 0, 0, 180
    {-28.05, 1.30, 6.31}
  }
  local ambrosiaPoolPositions = {
    {-29.01, 1.30, 26.30}
  }
  local ambrosiaTrailPositions = {
    {-28.04, 1.30, 11.31}
  }
  local spartanRiverWork_4x1_Positions = {
    -- 0 (left)
    {-31.03, 1.30, 21.30},
    -- 270 (right)
    {-24.03, 1.30, 6.30}
  }
  local spartanRiverWork_5x1_Positions = {
    -- 0
    {-18.05, 1.30, 25.31}
  }
  local blackGlacierPositions = {
    -- 90
    {-8.05, 1.30, 25.31},
    {-14.03, 1.30, 13.31}
  }
  local blackIcebergPositions = {
    {-16.04, 1.30, 27.30},
    {-14.04, 1.30, 19.30},
    {-16.04, 1.30, 9.30},
    {-20.04, 1.30, 5.31},
    {-8.04, 1.30, 5.30}
  }
  local giantGlobalIcebergPositions = {
    {-9.04, 1.30, 16.30}
  }
  local timefront_4x1_Positions = {
    -- 90
    {-4.04, 1.30, 26.13}
  }
  local timefront_5x1_Positions = {
    -- 90 (both)
    {-4.04, 1.30, 17.14},
    {-4.04, 1.30, 7.28}
  }

  local rotation = {0, 180, 0}

  for key,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if (key == 1 and terrainTileInfo.name == "Fortified City") or (key == 2 and terrainTileInfo.name == "City") or (key == 3 and terrainTileInfo.name == "Time-Frozen City") then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthOPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthIPositions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthZPositions)
    do
      for _,terrainTileInfo in pairs(box_Z.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthLPositions)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 0, 180})
            break
          end
        end
    end

  for _,terrainPosition in pairs(ambrosiaPoolPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Ambrosia Pool" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(ambrosiaTrailPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Ambrosia Trail" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWork_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if key == 1 and terrainTileInfo.name == "Spartan River Works (left)" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          elseif key == 2 and terrainTileInfo.name == "Spartan River Works (right)" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWork_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(blackGlacierPositions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Black Glacier" then
            if key == 1 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for _,terrainPosition in pairs(blackIcebergPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Black Iceberg" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(giantGlobalIcebergPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Giant Black Iceberg" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(timefront_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Timefront" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(timefront_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Timefront" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end
end

function takeTile(container, tileIndex, pos, rot)
  container.takeObject({
    index = tileIndex,
    position = pos,
    rotation = rot
  })
end