function onload()
  -- clickable area
  self.createButton({
      click_function="hypertimeOracleBattle_1_2_level", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="hypertimeOracleBattle_3_level", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="icarianHarpyBattle", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="burdenHardestToBearBattle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="endureTheSunBattle", function_owner=self,
      position={-0.324643552303314, 0.210000246763229, 0.330440640449524}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="raceTheSunBattle", function_owner=self,
      position={0.344906449317932, 0.210000261664391, 0.332746356725693}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function hypertimeOracleBattle_1_2_level()
  broadcastToAll("Hypertime Oracle Battle (1-2 level)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-12.04, 1.30, 27.33},
    {-8.04, 1.30, 5.30}
  }
  local timefront_4x1_Positions = {
    -- 90
    {-42.04, 1.30, 26.27}
  }
  local timefront_5x1_Positions = {
    -- 90
    {-42.04, 1.30, 17.24},
    {-42.04, 1.30, 7.28}
  }
  local blackIcebergPositions = {
    {-28.02, 1.30, 25.30},
    {-24.04, 1.30, 23.30},
    {-32.02, 1.30, 21.31},
    {-16.05, 1.30, 21.30},
    {-26.03, 1.30, 17.30},
    {-22.03, 1.30, 9.31},
    {-18.03, 1.30, 5.30}
  }
  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Time-Frozen City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
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

function hypertimeOracleBattle_3_level()
  broadcastToAll("Hypertime Oracle Battle (3+ level)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-6.03, 1.30, 27.32},
    {-8.04, 1.30, 5.30}
  }
  local timefront_4x1_Positions = {
    -- 90
    {-42.04, 1.30, 26.27}
  }
  local timefront_5x1_Positions = {
    -- 90
    {-42.04, 1.30, 17.24},
    {-42.04, 1.30, 7.28}
  }
  local blackIcebergPositions = {
    {-28.03, 1.30, 25.31},
    {-24.03, 1.30, 23.30},
    {-12.04, 1.30, 23.29},
    {-16.04, 1.30, 21.30},
    {-10.04, 1.30, 19.32},
    {-26.03, 1.30, 17.30},
    {-8.04, 1.30, 15.29},
    {-20.05, 1.30, 13.30},
    {-22.04, 1.30, 9.30},
    {-18.03, 1.30, 5.30}
  }
  local bigBlackIcebergPositions = {
    {-11.04, 1.30, 10.29}
  }
  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(bigBlackIcebergPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Giant Black Iceberg" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Time-Frozen City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
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

function icarianHarpyBattle()
  broadcastToAll("Icarian Harpy Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-32.03, 1.30, 25.28},
    {-36.01, 1.30, 11.29}
  }
  local blackIcebergPositions = {
    {-20.03, 1.30, 27.30},
    {-36.01, 1.30, 25.30},
    {-10.05, 1.30, 25.30},
    {-32.03, 1.30, 21.30},
    {-14.04, 1.30, 19.31},
    {-38.02, 1.30, 17.29},
    {-32.01, 1.30, 13.27},
    {-10.05, 1.30, 7.31},
    {-26.03, 1.30, 5.30},
    {-20.03, 1.30, 5.30}
  }
  local bigBlackIcebergPositions = {
    {-17.04, 1.30, 18.28},
    {-7.05, 1.30, 16.28},
    {-31.03, 1.30, 10.28}
  }
  local blackLakePositions = {
    {-24.03, 1.30, 15.30},
    {-12.04, 1.30, 11.29}
  }
  local blackGlacierPositions = {
    -- 270
    {-20.03, 1.30, 21.30},
    -- 0 (both)
    {-32.06, 1.30, 15.30},
    {-20.06, 1.30, 11.29}
  }
  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(bigBlackIcebergPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Giant Black Iceberg" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Time-Frozen City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(blackLakePositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Black Lake" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
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
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            end
            break
          end
        end
    end
end

function burdenHardestToBearBattle()
  broadcastToAll("Burden Hardest to Bear Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local columnPositions = {
    {-30.03, 1.30, 23.30},
    {-10.05, 1.30, 23.30},
    {-38.03, 1.30, 21.30},
    {-14.04, 1.30, 21.30},
    {-40.02, 1.30, 17.30},
    {-38.03, 1.30, 17.30},
    {-6.03, 1.30, 15.28},
    {-40.02, 1.30, 13.30},
    {-26.04, 1.30, 13.30},
    {-6.03, 1.30, 13.30},
    {-40.02, 1.30, 11.31},
    {-30.03, 1.30, 9.31},
    {-24.04, 1.30, 9.31},
    {-14.04, 1.30, 9.31},
    {-10.05, 1.30, 9.31},
    {-14.04, 1.30, 7.30}
  }
  local blackIcebergPositions = {
    {-36.02, 1.30, 5.30},
    {-34.04, 1.30, 5.30}
  }
  local cliffLPositions = {
    {-34.02, 1.30, 28.31},
    -- 360
    {-30.01, 1.30, 4.30}
  }
  local cliffZPositions = {
    {-40.03, 1.30, 26.30},
    -- 0
    {-6.04, 1.30, 6.30},
    -- 0, 180, 180 (both)
    {-6.04, 1.30, 26.30},
    {-40.01, 1.30, 6.30}
  }
  local cliffIPositions = {
    {-11.04, 1.30, 29.30},
    {-11.05, 1.30, 3.30},
    -- 90 (both)
    {-26.04, 1.30, 24.30},
    {-20.04, 1.30, 8.30}
  }
  local cliffOPositions = {
    {-21.03, 1.30, 26.30},
    {-9.04, 1.30, 16.31},
    {-35.02, 1.30, 10.29}
  }

  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(columnPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Column" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
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

  for key,terrainPosition in pairs(cliffLPositions)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            if key == 1 then
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 180, 180})
            else
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(cliffZPositions)
    do
      for _,terrainTileInfo in pairs(box_Z.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            if key == 2 then
              takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            elseif key == 3 or key == 4 then
              takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 180, 180})
            else
              takeTile(box_Z, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(cliffIPositions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            if key == 3 or key == 4 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(cliffOPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, {0, 360, 0})
            break
          end
        end
    end
end

function endureTheSunBattle()
  broadcastToAll("Endure the Sun Battle", {1, 1, 1})
  sunDescendantBattle()
end

function raceTheSunBattle()
  broadcastToAll("Race the Sun Battle", {1, 1, 1})
  sunDescendantBattle()
end

function sunDescendantBattle()
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local blackIcebergPositions = {
    {-36.02, 1.30, 23.30},
    {-32.03, 1.30, 23.30},
    {-18.05, 1.30, 23.30},
    {-26.02, 1.30, 19.30},
    {-16.03, 1.30, 19.30},
    {-32.03, 1.30, 13.30},
    {-20.03, 1.30, 13.30},
    {-14.04, 1.30, 11.30},
    {-28.03, 1.30, 9.30},
    {-18.05, 1.30, 9.30}
  }
  local blackGlacierPositions = {
    -- 0 (both)
    {-32.03, 1.30, 17.30},
    {-16.02, 1.30, 15.30},
    -- 270
    {-30.03, 1.30, 9.29}
  }
  local floatingRocksPositions = {
    {-27.03, 1.30, 26.31},
    {-19.04, 1.30, 4.29}
  }
  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(floatingRocksPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Floating Rocks" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(blackGlacierPositions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Black Glacier" then
            if key == 1 or key == 2 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            end
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