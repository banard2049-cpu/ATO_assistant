function onload()
  -- clickable area
  self.createButton({
      click_function="dragonOfPhobos_1_2_levels_positions", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="dragonOfPhobos_3_level_positions", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="meduketosBattle", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="harshTruthBattle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="whiteLieBattle", function_owner=self,
      position={-0.324643552303314, 0.210000246763229, 0.330440640449524}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="theDevilHimselfBattle", function_owner=self,
      position={0.344906449317932, 0.210000261664391, 0.332746356725693}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="thickerThanWaterBattle", function_owner=self,
      position={-0.327675282955170, 0.210000276565552, 0.730271160602570}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function dragonOfPhobos_1_2_levels_positions()
  broadcastToAll("Dragon of Phobos Battle (level 1-2)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local petrifiedVentPositions = {
    {-6.03, 1.30, 27.29},
    {-12.04, 1.30, 25.30},
    {-8.04, 1.30, 25.30},
    {-22.04, 1.30, 23.29},
    {-30.03, 1.30, 21.30},
    {-18.04, 1.30, 21.30},
    {-10.05, 1.30, 21.30},
    {-14.02, 1.30, 19.29},
    {-4.03, 1.30, 19.29},
    {-10.05, 1.30, 17.30},
    {-6.03, 1.30, 15.28},
    {-32.02, 1.30, 11.31},
    {-28.02, 1.30, 11.31},
    {-28.02, 1.30, 7.30},
    {-22.04, 1.30, 7.30},
    {-16.02, 1.30, 7.30},
    {-26.03, 1.30, 5.30},
    {-12.04, 1.30, 5.30},
    {-16.02, 1.30, 3.30}
  }
  local achologyPositions = {
    {-16.02, 1.30, 27.29},
    {-38.02, 1.30, 7.30}
  }
  local blackAbyssPositions = {
    {-6.03, 1.30, 9.32}
  }
  local lightwall_4x1_Positions = {
    {-39.07, 1.30, 11.31}
  }
  local lightwall_5x1_Positions = {
    -- 0, 180, 180
    {-22.05, 1.30, 3.30}
  }
  local trench_4x1_Positions = {
    {-35.01, 1.30, 29.28}
  }
  local trench_5x1_Positions = {
    -- 90
    {-42.02, 1.30, 21.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(petrifiedVentPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Petrified Vent" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(achologyPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Arcology" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(blackAbyssPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Black Abyss" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(lightwall_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Lightwall" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(lightwall_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Lightwall" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 180, 180})
            break
          end
        end
    end

  for key,terrainPosition in pairs(trench_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(trench_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end
end

function dragonOfPhobos_3_level_positions()
  broadcastToAll("Dragon of Phobos Battle (level 3+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local petrifiedVentPositions = {
    {-6.04, 1.30, 27.28},
    {-24.03, 1.30, 25.30},
    {-34.03, 1.30, 23.29},
    {-18.04, 1.30, 21.30},
    {-10.04, 1.30, 21.30},
    {-4.04, 1.30, 19.29},
    {-34.03, 1.30, 15.31},
    {-12.03, 1.30, 15.31},
    {-28.03, 1.30, 11.30},
    {-6.04, 1.30, 11.30},
    {-20.03, 1.30, 9.30},
    {-12.03, 1.30, 7.30},
    {-26.03, 1.30, 5.30},
    {-16.04, 1.30, 3.31}
  }
  local achologyPositions = {
    {-14.05, 1.30, 27.33},
    {-38.02, 1.30, 7.30}
  }
  local trench_4x1_Positions = {
    {-35.01, 1.30, 29.28}
  }
  local trench_5x1_Positions = {
    -- 90
    {-42.02, 1.30, 21.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(petrifiedVentPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Petrified Vent" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(achologyPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Arcology" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(trench_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(trench_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end
end

function meduketosBattle()
  broadcastToAll("Meduketos Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local petrifiedVentPositions = {
    {-40.03, 1.30, 27.30},
    {-34.01, 1.30, 27.30},
    {-24.03, 1.30, 27.30},
    {-10.03, 1.30, 27.30},
    {-28.02, 1.30, 25.30},
    {-6.05, 1.30, 25.30},
    {-32.04, 1.30, 23.30},
    {-38.02, 1.30, 21.30},
    {-8.04, 1.30, 21.30},
    {-34.01, 1.30, 19.29},
    {-8.04, 1.30, 15.30},
    {-40.03, 1.30, 13.31},
    {-16.05, 1.30, 13.31},
    {-26.03, 1.30, 11.30},
    {-10.03, 1.30, 11.30},
    {-20.04, 1.30, 9.30},
    {-14.04, 1.30, 7.30},
    {-38.02, 1.30, 5.30},
    {-22.04, 1.30, 5.30},
    {-6.05, 1.30, 5.30}
  }
  local achologyPositions = {
    {-20.04, 1.30, 21.30},
    {-32.04, 1.30, 13.31}
  }
  local lightwallPositions = {
    -- 0, 270, 180
    {-14.04, 1.30, 21.30}
  }
  local trenchPositions = {
    {-33.01, 1.30, 7.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(petrifiedVentPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Petrified Vent" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(achologyPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Arcology" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(lightwallPositions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Lightwall" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 180})
            break
          end
        end
    end

  for key,terrainPosition in pairs(trenchPositions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function harshTruthBattle()
  broadcastToAll("Harsh Truth Battle", {1, 1, 1})
  urFleeceBattle()
end

function whiteLieBattle()
  broadcastToAll("White Lie Battle", {1, 1, 1})
  urFleeceBattle()
end

function urFleeceBattle()
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local blackAbyssPositions = {
    {-38.03, 1.30, 25.27},
    {-22.02, 1.30, 19.30},
    {-14.05, 1.30, 13.30},
    {-30.05, 1.30, 7.31}
  }
  local trench_left_1x1_Positions = {
    -- 0
    {-42.08, 1.30, 29.30}
  }
  local trench_right_1x1_Positions = {
    -- 0
    {-3.96, 1.30, 29.30}
  }
  local trench_4x1_Positions = {
    {-27.06, 1.30, 29.30},
    {-8.97, 1.30, 29.30}
  }
  local trench_5x1_Positions = {
    {-36.11, 1.30, 29.30},
    {-18.02, 1.30, 29.30}
  }
  local track_1x1_Positions = {
    {-42.12, 1.30, 3.29},
    -- 0
    {-3.98, 1.30, 3.29}
  }
  local track_4x1_Positions = {
    -- 0 both (track tile 2 & track tile 3)
    {-19.01, 1.30, 3.29},
    {-27.10, 1.30, 3.29}
  }
  local track_5x1_Positions = {
    -- 0 both (track tile 1 & track tile 4)
    {-9.97, 1.30, 3.29},
    {-36.14, 1.30, 3.29}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(blackAbyssPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Black Abyss" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(trench_left_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Trench (left)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(trench_right_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Trench (right)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(trench_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(trench_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Trench" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(track_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Track Tile" then
            if key == 1 then
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            else
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(track_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if key == 1 and terrainTileInfo.name == "Track Tile 2" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          elseif key == 2 and terrainTileInfo.name == "Track Tile 3" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(track_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if key == 1 and terrainTileInfo.name == "Track Tile 1" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          elseif key == 2 and terrainTileInfo.name == "Track Tile 4" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end
end

function theDevilHimselfBattle()
  broadcastToAll("The Devil Himself Battle", {1, 1, 1})
end

function thickerThanWaterBattle()
  broadcastToAll("Thicker Than Water Battle", {1, 1, 1})
end

function takeTile(container, tileIndex, pos, rot)
  container.takeObject({
    index = tileIndex,
    position = pos,
    rotation = rot
  })
end