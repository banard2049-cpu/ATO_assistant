function onload()
  -- clickable area
  self.createButton({
      click_function="hekatonBattle_1_3_levels", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="hekatonBattle_4_level", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="labyrinthaurosBattle", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="ambushBattle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="temenosBattleBroadcast", function_owner=self,
      position={-0.324643552303314, 0.210000246763229, 0.330440640449524}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="thereIsNoMazeBattleBroadcast", function_owner=self,
      position={0.344906449317932, 0.210000261664391, 0.332746356725693}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="pursuerBattle", function_owner=self,
      position={-0.327675282955170, 0.210000276565552, 0.730271160602570}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="pursuerEndBattle", function_owner=self,
      position={0.341201841831207, 0.210000291466713, 0.733038187026978}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function hekatonBattle_1_3_levels()
  broadcastToAll("Hekaton Battle (level 1-3)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local columnPositions = {
    {-26.03, 1.30, 27.31},
    {-20.04, 1.30, 27.31},
    {-36.04, 1.30, 25.30},
    {-10.02, 1.30, 25.30},
    {-32.02, 1.30, 21.29},
    {-14.04, 1.30, 19.31},
    {-38.03, 1.30, 17.29},
    {-8.03, 1.30, 17.29},
    {-38.03, 1.30, 15.30},
    {-8.03, 1.30, 15.30},
    {-32.03, 1.30, 13.30},
    {-14.04, 1.30, 11.30},
    {-36.04, 1.30, 7.29},
    {-10.02, 1.30, 7.29},
    {-26.03, 1.30, 5.29},
    {-20.04, 1.30, 5.29}
  }
  local cityPositions = {
    {-36.02, 1.30, 21.29},
    {-10.03, 1.30, 11.29}
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
end

function hekatonBattle_4_level()
  broadcastToAll("Hekaton Battle (level 4+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_I = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]

  local columnPositions = {
    {-20.04, 1.30, 27.31},
    {-36.04, 1.30, 25.30},
    {-10.02, 1.30, 25.30},
    {-32.02, 1.30, 21.29},
    {-14.04, 1.30, 19.31},
    {-8.03, 1.30, 17.29},
    {-32.03, 1.30, 13.30},
    {-14.04, 1.30, 11.30},
    {-36.04, 1.30, 7.29},
    {-10.02, 1.30, 7.29},
    {-26.03, 1.30, 5.29}
  }
  local cityPositions = {
    {-36.02, 1.30, 21.29},
    {-10.03, 1.30, 11.29}
  }
  local mazeFissurePositionsO = {
    {-27.00, 1.30, 26.28}
  }
  local mazeFissurePositionsI = {
    -- 90
    {-38.02, 1.30, 14.28},
    {-11.03, 1.30, 15.30}
  }
  local mazeFissurePositionsL = {
    -- 270
    {-25.03, 1.30, 17.29},
    {-18.01, 1.30, 6.28}
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

  for _,terrainPosition in pairs(mazeFissurePositionsO)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Maze Fissure" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(mazeFissurePositionsI)
    do
      for _,terrainTileInfo in pairs(box_I.getObjects())
        do
          if terrainTileInfo.name == "Maze Fissure" then
            if key == 1 then
              takeTile(box_I, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              print(terrainTileInfo.name)
              takeTile(box_I, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(mazeFissurePositionsL)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Maze Fissure" then
            if key == 1 then
              takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_L, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end
end

function labyrinthaurosBattle()
  broadcastToAll("Labyrinthauros Battle", {1, 1, 1})
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_I = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local cityPositions = {
    {-14.03, 1.30, 23.33},
    {-38.05, 1.30, 9.29}
  }
  local labyrinthPositionsO = {
    -- 0
    {-29.02, 1.30, 20.31}
  }
  local labyrinthPositionsI = {
    -- 0
    {-29.02, 1.30, 11.30}
  }
  local labyrinthPositionsL = {
    {-20.04, 1.30, 20.30}
  }
  local labyrinthPositionsZ = {
    -- 90
    {-19.02, 1.30, 11.29}
  }

  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(labyrinthPositionsO)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsI)
    do
      for _,terrainTileInfo in pairs(box_I.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_I, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsL)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_L, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsZ)
    do
      for _,terrainTileInfo in pairs(box_Z.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_Z, terrainTileInfo.index, terrainPosition, {0, 90, 180})
            break
          end
        end
    end
end

function ambushBattle()
  broadcastToAll("Ambush Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_I = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]

  local columnPositions = {
    {-26.03, 1.30, 27.30},
    {-20.04, 1.30, 25.31},
    {-18.05, 1.30, 23.29},
    {-22.05, 1.30, 21.30},
    {-14.05, 1.30, 19.31},
    {-32.04, 1.30, 15.30},
    {-36.03, 1.30, 13.31},
    {-14.05, 1.30, 13.31}
  }
  local cityPositions = {
    {-36.03, 1.30, 23.31},
    {-36.03, 1.30, 9.29}
  }
  local labyrinthPositionsI = {
    -- 270
    {-20.04, 1.30, 10.28}
  }
  local labyrinthPositionsL = {
    -- 0, 270, 180
    {-29.02, 1.30, 19.30}
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

  for _,terrainPosition in pairs(labyrinthPositionsI)
    do
      for _,terrainTileInfo in pairs(box_I.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_I, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsL)
    do
      for _,terrainTileInfo in pairs(box_L.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_L, terrainTileInfo.index, terrainPosition, {0, 270, 180})
            break
          end
        end
    end
end

function thereIsNoMazeBattleBroadcast() 
  broadcastToAll("There is No Maze Battle", {1, 1, 1})
  temenosBattle()
end

function temenosBattleBroadcast() 
  broadcastToAll("Temenos Battle", {1, 1, 1})
  temenosBattle()
end

function temenosBattle()
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local boxI = getObjectsWithTag("boxTile_4x1")[1]
  local boxL = getObjectsWithTag("boxTile_L")[1]
  local boxZ = getObjectsWithTag("boxTile_Z")[1]

  local columnPositions = {
    {-30.02, 1.30, 23.26},
    {-14.03, 1.30, 23.26},
    {-34.02, 1.30, 21.30},
    {-10.03, 1.30, 21.30},
    {-34.02, 1.30, 9.30},
    {-10.03, 1.30, 9.30},
    {-30.02, 1.30, 7.30},
    {-14.03, 1.30, 7.30}
  }
  local cityPositions = {
    {-34.02, 1.30, 25.30},
    {-10.03, 1.30, 5.28}
  }
  local labyrinthPositionsO = {
    -- 0
    {-19.04, 1.30, 26.31}
  }
  local labyrinthPositionsI = {
    {-29.04, 1.30, 15.34}
  }
  local labyrinthPositionsL = {
    -- 0, 0, 180
    {-16.05, 1.30, 16.31}
  }
  local labyrinthPositionsZ = {
    -- 0, 0, 180
    {-24.02, 1.30, 6.31}
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

  for _,terrainPosition in pairs(labyrinthPositionsO)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsI)
    do
      for _,terrainTileInfo in pairs(boxI.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(boxI, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsL)
    do
      for _,terrainTileInfo in pairs(boxL.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(boxL, terrainTileInfo.index, terrainPosition, {0, 0, 180})
            break
          end
        end
    end

  for _,terrainPosition in pairs(labyrinthPositionsZ)
    do
      for _,terrainTileInfo in pairs(boxZ.getObjects())
        do
          if terrainTileInfo.name == "Labyrinth" then
            takeTile(boxZ, terrainTileInfo.index, terrainPosition, {0, 0, 180})
            break
          end
        end
    end
end

function pursuerBattle()
  broadcastToAll("Pursuer Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]

  local columnPositions = {
    {-26.03, 1.30, 27.30},
    {-20.04, 1.30, 27.30},
    {-36.04, 1.30, 25.30},
    {-14.04, 1.30, 25.30},
    {-8.04, 1.30, 21.30},
    {-32.03, 1.30, 19.30},
    {-14.04, 1.30, 19.30},
    {-8.04, 1.30, 19.30},
    {-38.04, 1.30, 13.30},
    {-32.03, 1.30, 13.30},
    {-14.04, 1.30, 13.30},
    {-38.04, 1.30, 11.30},
    {-34.02, 1.30, 9.29},
    {-10.04, 1.30, 7.30},
    {-26.03, 1.30, 5.30},
    {-20.04, 1.30, 5.30}
  }
  local ambrosiaPositions = {
    {-23.04, 1.30, 22.29},
    {-33.02, 1.30, 16.30},
    {-15.03, 1.30, 16.30},
    {-23.04, 1.30, 6.31}
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

  for _,terrainPosition in pairs(ambrosiaPositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Ambrosia Pool" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function pursuerEndBattle()
  broadcastToAll("Pursuit's End Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local columnPositions = {
    {-20.04, 1.30, 27.30},
    {-36.04, 1.30, 25.30},
    {-14.04, 1.30, 25.30},
    {-8.04, 1.30, 21.30},
    {-32.03, 1.30, 19.30},
    {-8.04, 1.30, 19.30},
    {-32.03, 1.30, 13.30},
    {-14.04, 1.30, 13.30},
    {-38.04, 1.30, 11.30},
    {-34.02, 1.30, 9.29},
    {-10.04, 1.30, 7.30},
    {-26.03, 1.30, 5.30}
  }
  local ambrosiaPoolPositions = {
    {-23.04, 1.30, 22.29},
    {-27.02, 1.30, 16.30},
    {-19.05, 1.30, 16.30},
    {-23.04, 1.30, 6.31}
  }
  local ambrosiaTrailPositions = {
    {-30.04, 1.30, 27.29},
    {-36.03, 1.30, 17.30},
    {-14.06, 1.30, 9.31}
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
end

function takeTile(container, tileIndex, pos, rot)
  container.takeObject({
    index = tileIndex,
    position = pos,
    rotation = rot
  })
end