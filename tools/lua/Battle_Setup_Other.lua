function onload()
  -- clickable area
  self.createButton({
      click_function="tutorialBattle", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="hekaton_level_8_battle", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="cyclonus_8_level_Battle", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="burden_5_level_Battle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function tutorialBattle()
  broadcastToAll("Tutorial Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]

  local terrainTilePositions = {
    {-26.03, 1.30, 27.31},
    {-20.04, 1.30, 27.31},
    {-36.04, 1.30, 25.30},
    {-10.02, 1.30, 25.30},
    {-32.03, 1.30, 19.31},
    {-14.04, 1.30, 19.31},
    {-38.03, 1.10, 17.29},
    {-8.03, 1.30, 17.29},
    {-38.03, 1.30, 15.30},
    {-8.03, 1.30, 15.30},
    {-32.03, 1.30, 13.30},
    {-14.04, 1.30, 13.30},
    {-36.04, 1.30, 7.29},
    {-10.02, 1.30, 7.29},
    {-26.03, 1.30, 5.29},
    {-20.04, 1.30, 5.29}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(terrainTilePositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Column" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function hekaton_level_8_battle()
  broadcastToAll("Hekaton Battle (level 8+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_I = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_O = getObjectsWithTag("boxTile_2x2")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local columnPositions = {
    {-20.03, 1.30, 27.29},
    {-38.02, 1.30, 25.30},
    {-10.03, 1.30, 25.30},
    {-34.01, 1.30, 21.31},
    {-14.03, 1.30, 19.29},
    {-8.03, 1.30, 17.29},
    {-14.03, 1.30, 11.30},
    {-36.03, 1.30, 7.29},
    {-10.03, 1.30, 7.29},
    {-26.03, 1.30, 5.30}
  }
  local cityPositions = {
    {-38.01, 1.30, 21.30},
    {-10.03, 1.30, 11.30}
  }
  local labyrinthPositionsI = {
    -- 270
    {-40.02, 1.30, 14.30},
    -- 0
    {-11.00, 1.30, 15.31}
  }
  local labyrinthPositionsL = {
    -- 90
    {-25.04, 1.30, 17.31},
    -- 0, 360, 180
    {-18.04, 1.30, 6.31}
  }
  local labyrinthPositionsO = {
    -- 0
    {-29.01, 1.30, 26.31}
  }
  local labyrinthPositionsZ = {
    -- 0 (both)
    {-16.04, 1.30, 24.30},
    {-30.04, 1.30, 8.31}
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

  for _,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(labyrinthPositionsI)
    do
      for _,terrainTileInfo in pairs(box_I.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            if key == 1 then
              takeTile(box_I, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_I, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(labyrinthPositionsL)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            if key == 1 then
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 0, 180})
            end
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsO)
    do
      for _,terrainTileInfo in pairs(box_O.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_O, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsZ)
    do
      for _,terrainTileInfo in pairs(box_Z.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end
end

function cyclonus_8_level_Battle()
  broadcastToAll("Cyclonus Battle (level 8+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local cityPositions = {
    {-16.04, 1.30, 27.29},
    {-30.02, 1.30, 9.31}
  }
  local spartanRiverWorkLeft_1x1_Positions = {
    -- 90
    {-24.03, 1.30, 3.32}
  }
  local spartanRiverWorkRight_1x1_Positions = {
    -- 270
    {-12.02, 1.30, 3.34}
  }
  local spartanRiverWorkCorner_1x1_Positions = {
    {-4.02, 1.30, 21.32},
    -- 270
    {-34.06, 1.30, 19.31},
    -- 90
    {-4.02, 1.30, 19.31}
  }
  local spartanRiverWorkLeft_4x1_Positions = {
    -- 90 (both)
    {-12.02, 1.30, 26.17},
    {-12.02, 1.30, 8.33},
    -- 0
    {-39.05, 1.30, 19.31},
    -- 270
    {-24.03, 1.30, 16.28}
  }
  local spartanRiverWorkRight_4x1_Positions = {
    -- 90
    {-24.03, 1.30, 8.31}
  }
  local spartanRiverWork_5x1_Positions = {
    -- 270
    {-24.03, 1.30, 25.19},
    -- 90 (both)
    {-34.06, 1.30, 13.37},
    {-12.02, 1.30, 17.26}
  }
  local spartanRiverWork_Z_Positions = {
    -- 90
    {-33.03, 1.30, 5.31}
  }

  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(cityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Fortified City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkLeft_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkRight_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (right)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkCorner_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (corner)" then
            if key == 1 then
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            elseif key == 2 then
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            end
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWork_Z_Positions)
    do
      for _,terrainTileInfo in pairs(box_Z.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works" then
            takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkLeft_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            if key == 1 or key == 2 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            elseif key == 3 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            else
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            end
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkRight_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (right)" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWork_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works" then
            if key == 2 or key == 3 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            elseif key == 1 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            end
            break
          end
        end
    end
end

function burden_5_level_Battle()
  broadcastToAll("Burden Battle (level 5+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local columnPositions = {
    {-30.03, 1.30, 29.29},
    {-28.02, 1.30, 23.30},
    {-14.03, 1.30, 21.30},
    {-42.00, 1.30, 19.29},
    {-22.04, 1.30, 13.30},
    {-12.03, 1.30, 11.31},
    {-24.04, 1.30, 9.34},
    {-36.03, 1.30, 3.32}
  }
  local cliffLPositions = {
    -- 0
    {-26.01, 1.30, 28.32},
    -- 0, 270, 180
    {-41.04, 1.30, 9.31},
    -- 0, 180, 180
    {-26.02, 1.30, 4.30}
  }
  local cliffZPositions = {
    -- 0, 0, 180 (both)
    {-20.02, 1.30, 26.30},
    {-6.03, 1.30, 24.31},
    -- 270
    {-37.02, 1.30, 23.26},
    {-20.03, 1.30, 6.29},
    {-6.04, 1.30, 8.31}
  }
  local cliffIPositions = {
    -- 360 (both)
    {-13.04, 1.30, 25.31},
    {-13.06, 1.30, 7.33},
    -- 90 (both)
    {-34.01, 1.30, 14.31},
    {-30.03, 1.30, 6.32}
  }
  local cliffOPositions = {
    -- 0 (all)
    {-27.03, 1.30, 18.31},
    {-15.03, 1.30, 18.31},
    {-9.04, 1.30, 16.31}
  }
  local blackGlacierPositions = {
    {-14.05, 1.30, 23.30},
    {-28.03, 1.30, 11.31},
    {-18.09, 1.30, 9.33}
  }
  local blackLakePositions = {
    {-32.02, 1.30, 21.30},
    {-38.02, 1.30, 17.25}
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

  for _,terrainPosition in pairs(blackGlacierPositions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Black Glacier" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, rotation)
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

  for key,terrainPosition in pairs(cliffLPositions)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            if key == 1 then
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            elseif key == 2 then
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 270, 180})
            else
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 180, 180})
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
            if key == 1 or key == 2 then
              takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 180, 180})
            elseif key == 3 then
              takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 270, 0})
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
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 360, 0})
            end
            break
          end
        end
    end

  for _,terrainPosition in pairs(cliffOPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Cliff" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, {0, 0, 0})
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