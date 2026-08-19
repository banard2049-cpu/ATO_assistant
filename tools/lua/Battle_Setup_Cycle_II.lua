function onload()
  -- clickable area
  self.createButton({
      click_function="cyclonusBattle", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="chimeraMetastasiosBattle_1_2_level", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="chimeraMetastasiosBattle_3_level", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="burdenBattle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="theCruelLessonBattle", function_owner=self,
      position={-0.324643552303314, 0.210000246763229, 0.330440640449524}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="whatAreYouBattle", function_owner=self,
      position={0.344906449317932, 0.210000261664391, 0.332746356725693}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function cyclonusBattle()
  broadcastToAll("Cyclonus Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-16.07, 1.30, 27.30},
    {-30.02, 1.30, 9.30}
  }
  local spartanRiverWorkLeft_1x1_Positions = {
    -- 90
    {-24.03, 1.30, 5.31}
  }
  local spartanRiverWorkRight_1x1_Positions = {
    -- 90
    {-24.03, 1.30, 3.31}
  }
  local spartanRiverWorkCorner_1x1_Positions = {
    -- 270
    {-34.04, 1.30, 19.31},
    {-4.05, 1.30, 21.32},
    -- 90
    {-4.05, 1.30, 19.31}
  }
  local spartanRiverWorkLeft_4x1_Positions = {
    -- 270
    {-12.05, 1.30, 26.30},
    -- 0
    {-39.03, 1.30, 19.31},
    -- 270
    {-12.05, 1.30, 6.32}
  }
  local spartanRiverWorkRight_4x1_Positions = {
    -- 90
    {-12.05, 1.30, 14.30}
  }
  local spartanRiverWork_5x1_Positions = {
    -- 270
    {-24.03, 1.30, 25.29},
    -- 90
    {-34.04, 1.30, 7.32},
    -- 270
    {-24.03, 1.30, 11.29}
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
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
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
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            elseif key == 3 then
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkLeft_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            if key == 1 or key == 3 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            elseif key == 2 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
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
            if key == 1 or key == 3 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            elseif key == 2 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            end
            break
          end
        end
    end
end

function chimeraMetastasiosBattle_1_2_level()
  broadcastToAll("Chimera Metastasios Battle (1-2 level)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local columnPositions = {
    {-12.04, 1.30, 25.30},
    {-10.02, 1.30, 15.30},
    {-26.04, 1.30, 11.31},
    {-32.04, 1.30, 5.30}
  }
  local ambrosiaPositions = {
    {-39.02, 1.30, 24.29},
    {-9.05, 1.30, 6.30}
  }
  local cityPositions = {
    {-12.04, 1.30, 19.31},
    {-34.04, 1.30, 9.29}
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
end

function chimeraMetastasiosBattle_3_level()
  broadcastToAll("Chimera Metastasios Battle (level 3+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local columnPositions = {
    {-36.04, 1.30, 25.30},
    {-12.04, 1.30, 25.30},
    {-8.04, 1.30, 21.30},
    {-42.00, 1.30, 17.30},
    {-10.02, 1.30, 15.30},
    {-26.04, 1.30, 11.31},
    {-32.04, 1.30, 5.30}
  }
  local ambrosiaPositions = {
    {-39.02, 1.30, 24.29},
    {-27.03, 1.30, 22.30},
    {-39.01, 1.30, 16.30},
    {-17.03, 1.30, 8.31},
    {-9.05, 1.30, 6.30}
  }
  local cityPositions = {
    {-12.04, 1.30, 19.31},
    {-34.04, 1.30, 9.29}
  }
  local spartanRiverWork_4x1_positions = {
    -- 270
    {-14.04, 1.30, 26.29},
    -- 90
    {-12.04, 1.30, 6.31}
  }
  local spartanRiverWork_5x1_positions = {
    -- 90
    {-34.03, 1.30, 25.28},
    -- 270
    {-30.02, 1.30, 7.31}
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

  for key,terrainPosition in pairs(spartanRiverWork_4x1_positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            if key == 1 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWork_5x1_positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works" then
            if key == 1 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            end
            break
          end
        end
    end
end

function burdenBattle()
  broadcastToAll("Burden Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]

  local columnPositions = {
    {-30.03, 1.30, 29.27},
    {-28.02, 1.30, 23.30},
    {-20.05, 1.30, 23.30},
    {-14.04, 1.30, 21.30},
    {-42.01, 1.30, 19.31},
    {-22.04, 1.30, 13.31},
    {-12.03, 1.30, 11.30},
    {-24.04, 1.30, 9.31},
    {-36.02, 1.30, 3.34}
  }
  local cliffLPositions = {
    -- 0
    {-26.05, 1.30, 28.32},
    -- 0, 270, 180
    {-41.03, 1.30, 9.31},
    -- 0, 180, 180
    {-26.04, 1.30, 4.30}
  }
  local cliffZPositions = {
    -- 0, 180, 180 (both)
    {-20.06, 1.30, 26.31},
    {-6.04, 1.30, 24.29},
    -- 270
    {-37.02, 1.30, 23.31},
    {-20.05, 1.30, 6.34},
    {-6.03, 1.30, 8.32}
  }
  local cliffIPositions = {
    {-13.05, 1.30, 25.30},
    {-13.04, 1.30, 7.33},
    -- 90 (both)
    {-34.03, 1.30, 14.28},
    {-30.03, 1.30, 6.30}
  }
  local cliffOPositions = {
    -- 360 (all)
    {-27.04, 1.30, 18.30},
    {-15.04, 1.30, 18.30},
    {-9.04, 1.30, 16.30}
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

function theCruelLessonBattle()
  broadcastToAll("The Cruel Lesson Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-8.03, 1.30, 27.31},
    {-32.00, 1.30, 7.31}
  }
  local argoHuel_4x1_Positions = {
    -- 90
    {-42.04, 1.30, 26.24}
  }
  local argoHuel_5x1_Positions = {
    -- 90 (both)
    {-42.04, 1.30, 17.25},
    {-42.04, 1.30, 7.26}
  }
  local spartanRiverWorkLeft_4x1_Positions = {
    -- 90 (both)
    {-12.04, 1.30, 26.26},
    {-12.04, 1.30, 8.29}
  }
  local spartanRiverWork_5x1_Positions = {
    -- 90
    {-12.04, 1.30, 17.29},
    {-30.03, 1.30, 3.30},
    {-18.03, 1.30, 3.30}
  }
  local spartanRiverWorkCorner_1x1_Positions = {
    -- 0
    {-12.04, 1.30, 3.30}
  }
  local spartanRiverWorkLeft_1x1_Positions = {
    -- 0
    {-24.05, 1.30, 3.30}
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

  for _,terrainPosition in pairs(argoHuel_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Argo Hull" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(argoHuel_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Argo Hull" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkLeft_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkCorner_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (corner)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkLeft_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
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
            if key == 1 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end
end

function whatAreYouBattle()
  broadcastToAll("What Are You? Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local cityPositions = {
    {-22.05, 1.30, 25.29},
    {-10.03, 1.30, 15.30},
    {-18.05, 1.30, 7.31}
  }
  local argoHuel_4x1_Positions = {
    -- 90
    {-42.04, 1.30, 26.24}
  }
  local argoHuel_5x1_Positions = {
    -- 90 (both)
    {-42.04, 1.30, 17.25},
    {-42.04, 1.30, 7.26}
  }
  local spartanRiverWorkLeft_4x1_Positions = {
    -- 0
    {-29.03, 1.30, 29.30},
    -- 90
    {-12.04, 1.30, 8.29},
    {-36.99, 1.30, 3.30},
    {-19.05, 1.30, 3.30}
  }
  local spartanRiverWorkRight_4x1_Positions = {
    {-36.99, 1.30, 29.30}
  }
  local spartanRiverWork_5x1_Positions = {
    -- 0
    {-20.06, 1.30, 29.30},
    -- 90
    {-12.04, 1.30, 23.31},
    {-28.02, 1.30, 3.30}
  }
  local spartanRiverWorkCorner_1x1_Positions = {
    -- 270
    {-12.04, 1.30, 29.30},
    -- 0
    {-12.04, 1.30, 3.30}
  }
  local spartanRiverWorkLeft_1x1_Positions = {
    {-14.05, 1.30, 29.30}
  }
  local spartanRiverWorkRight_1x1_Positions = {
    -- 0
    {-14.05, 1.30, 3.30}
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

  for _,terrainPosition in pairs(argoHuel_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Argo Hull" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(argoHuel_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Argo Hull" then
            takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkLeft_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(spartanRiverWorkRight_1x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (right)" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
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
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 270, 0})
            else
              takeTile(box_1x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkLeft_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (left)" then
            if key == 1 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            elseif key == 2 then
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            end
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWorkRight_4x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_4x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works (right)" then
            takeTile(box_4x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for key,terrainPosition in pairs(spartanRiverWork_5x1_Positions)
    do
      for _,terrainTileInfo in pairs(box_5x1.getObjects())
        do
          if terrainTileInfo.name == "Spartan River Works" then
            if key == 1 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 0, 0})
            elseif key == 2 then
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, {0, 90, 0})
            else
              takeTile(box_5x1, terrainTileInfo.index, terrainPosition, rotation)
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