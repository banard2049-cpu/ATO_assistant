function onload()
  -- clickable area
  self.createButton({
      click_function="midascore_level_1", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="midascore_level_2", function_owner=self,
      position={0.346171945333481, 0.210000261664391, -0.462963163852692}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="demidjinnBattle", function_owner=self,
      position={-0.323692858219147, 0.210000246763229, -0.065494969487190}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="pandoraHorizonBattle", function_owner=self,
      position={0.344485640525818, 0.210000291466713, -0.065156556665897}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="theCrashBattle", function_owner=self,
      position={-0.324643552303314, 0.210000246763229, 0.330440640449524}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="reapTheWhirlwindBattle", function_owner=self,
      position={0.344906449317932, 0.210000261664391, 0.332746356725693}, height=60, width=280, color={1,1,1,0}, label=""
  })
  self.createButton({
      click_function="theWinnowingBattle", function_owner=self,
      position={-0.327675282955170, 0.210000276565552, 0.730271160602570}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function midascore_level_1()
  broadcastToAll("Midascore Battle (level 1)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local iremTowerPositions = {
    {-36.01, 1.30, 27.30},
    {-14.03, 1.30, 27.30},
    {-12.04, 1.30, 25.30},
    {-22.04, 1.30, 23.29},
    {-32.01, 1.30, 21.31},
    {-18.05, 1.30, 21.31},
    {-4.04, 1.30, 19.28},
    {-38.03, 1.30, 17.30},
    {-14.03, 1.30, 17.30},
    {-6.04, 1.30, 15.29},
    {-26.03, 1.30, 13.31},
    {-40.03, 1.30, 11.30},
    {-32.01, 1.30, 11.30},
    {-22.04, 1.30, 11.30},
    {-18.05, 1.30, 7.30},
    {-40.03, 1.30, 5.30},
    {-26.03, 1.30, 5.30},
    {-4.04, 1.30, 5.30},
    {-38.03, 1.30, 3.32},
    {-16.04, 1.30, 3.32}
  }
  local iremCityPositions = {
    {-36.03, 1.30, 21.31},
    {-12.04, 1.30, 11.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(iremCityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Irem City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function midascore_level_2()
  broadcastToAll("Midascore Battle (level 2+)", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local iremTowerPositions = {
    {-36.01, 1.30, 27.30},
    {-14.03, 1.30, 27.30},
    {-12.04, 1.30, 25.30},
    {-26.03, 1.30, 23.29},
    {-18.03, 1.30, 23.29},
    {-32.01, 1.30, 21.31},
    {-4.04, 1.30, 19.28},
    {-38.03, 1.30, 17.30},
    {-14.03, 1.30, 17.30},
    {-6.04, 1.30, 15.29},
    {-26.03, 1.30, 13.31},
    {-40.03, 1.30, 11.30},
    {-32.01, 1.30, 11.30},
    {-22.04, 1.30, 11.30},
    {-26.03, 1.30, 7.30},
    {-18.03, 1.30, 7.30},
    {-4.04, 1.30, 7.30},
    {-40.03, 1.30, 5.30},
    {-38.03, 1.30, 3.32},
    {-16.04, 1.30, 3.32}
  }
  local iremCityPositions = {
    {-36.03, 1.30, 21.31},
    {-12.04, 1.30, 11.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(iremCityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Irem City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function demidjinnBattle()
  broadcastToAll("Demidjinn Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local iremTowerPositions = {
    {-36.03, 1.30, 27.30},
    {-14.04, 1.30, 27.30},
    {-10.05, 1.30, 25.30},
    {-22.04, 1.30, 23.28},
    {-32.03, 1.30, 21.29},
    {-18.04, 1.30, 21.29},
    {-4.03, 1.30, 19.30},
    {-38.02, 1.30, 17.30},
    {-14.04, 1.30, 17.30},
    {-6.03, 1.30, 15.29},
    {-26.03, 1.30, 13.30},
    {-40.02, 1.30, 11.30},
    {-32.03, 1.30, 11.30},
    {-22.04, 1.30, 11.30},
    {-18.04, 1.30, 7.31},
    {-40.02, 1.30, 5.31},
    {-26.03, 1.30, 5.31},
    {-38.02, 1.30, 3.29},
    {-16.05, 1.30, 3.29}
  }
  local iremCityPositions = {
    {-36.03, 1.30, 21.29},
    {-12.04, 1.30, 11.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(iremCityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Irem City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function pandoraHorizonBattle()
  broadcastToAll("Pandora Horizon Battle", {1, 1, 1})
  babelianLunacyBattle()
end

function theCrashBattle()
  broadcastToAll("The Crash Battle", {1, 1, 1})
  babelianLunacyBattle()
end

function babelianLunacyBattle()
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local iremTowerPositions = {
    {-22.04, 1.30, 29.30},
    {-36.02, 1.30, 27.30},
    {-14.04, 1.30, 27.30},
    {-24.03, 1.30, 25.31},
    {-12.03, 1.30, 25.31},
    {-20.05, 1.30, 23.30},
    {-32.02, 1.30, 21.30},
    {-4.04, 1.30, 19.30},
    {-38.03, 1.30, 17.29},
    {-14.04, 1.30, 17.29},
    {-32.02, 1.30, 15.30},
    {-6.04, 1.30, 15.30},
    {-26.04, 1.30, 13.31},
    {-40.03, 1.30, 11.30},
    {-32.02, 1.30, 11.30},
    {-24.03, 1.30, 11.30},
    {-22.04, 1.30, 7.30},
    {-4.04, 1.30, 7.30},
    {-40.03, 1.30, 5.31},
    {-38.03, 1.30, 3.31}
  }
  local iremCityPositions = {
    {-36.02, 1.30, 21.30},
    {-12.03, 1.30, 11.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(iremCityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Irem City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function reapTheWhirlwindBattle()
  broadcastToAll("Reap the Whirlwind Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]

  local argoHuel_4x1_Positions = {
    -- 90
    {-42.04, 1.30, 26.24}
  }
  local argoHuel_5x1_Positions = {
    -- 90 (both)
    {-42.04, 1.30, 17.25},
    {-42.04, 1.30, 7.26}
  }
  local ambrosiaCloudPositions = {
    {-16.05, 1.30, 25.29},
    {-34.02, 1.30, 21.29},
    {-14.04, 1.30, 9.29},
    {-34.02, 1.30, 5.30}
  }
  local abandonedTemplePositions = {
    {-5.06, 1.30, 28.30}
  }
  local iremTowerPositions = {
    {-36.02, 1.30, 27.30},
    {-12.05, 1.30, 25.29},
    {-22.04, 1.30, 23.30},
    {-30.03, 1.30, 21.29},
    {-18.05, 1.30, 21.29},
    {-10.04, 1.30, 21.29},
    {-4.03, 1.30, 19.31},
    {-38.02, 1.30, 17.30},
    {-14.04, 1.30, 17.30},
    {-6.03, 1.30, 15.29},
    {-26.04, 1.30, 13.30},
    {-40.03, 1.30, 11.29},
    {-32.03, 1.30, 11.29},
    {-22.04, 1.30, 11.29},
    {-32.03, 1.30, 9.29},
    {-18.05, 1.30, 7.29},
    {-26.04, 1.30, 5.30},
    {-4.03, 1.30, 5.30},
    {-38.02, 1.30, 3.29},
    {-16.05, 1.30, 3.29}
  }
  local rotation = {0, 180, 0}

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

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(ambrosiaCloudPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Ambrosia Cloud" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(abandonedTemplePositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Abandoned Temple" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end
end

function theWinnowingBattle()
  broadcastToAll("The Winnowing Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]

  local ambrosiaCloudPositions = {
    {-24.02, 1.30, 27.28},
    {-34.02, 1.30, 21.31},
    {-10.04, 1.30, 15.29},
    {-34.02, 1.30, 5.29}
  }
  local abandonedTemplePositions = {
    {-41.03, 1.30, 8.30}
  }
  local iremCityPositions = {
    {-14.05, 1.30, 25.31},
    {-30.04, 1.30, 11.30}
  }
  local iremTowerPositions = {
    {-36.02, 1.30, 27.28},
    {-10.04, 1.30, 27.28},
    {-22.04, 1.30, 23.26},
    {-42.02, 1.30, 21.31},
    {-30.04, 1.30, 21.31},
    {-18.04, 1.30, 21.31},
    {-10.04, 1.30, 21.31},
    {-4.03, 1.30, 19.31},
    {-38.04, 1.30, 17.31},
    {-14.05, 1.30, 17.31},
    {-38.04, 1.30, 15.29},
    {-6.04, 1.30, 15.29},
    {-40.02, 1.30, 11.30},
    {-22.04, 1.30, 11.30},
    {-12.04, 1.30, 11.30},
    {-18.04, 1.30, 7.29},
    {-26.03, 1.30, 5.29},
    {-4.03, 1.30, 5.29},
    {-38.04, 1.30, 3.30},
    {-16.03, 1.30, 3.30}
  }
  local rotation = {0, 180, 0}

  for _,terrainPosition in pairs(iremTowerPositions)
    do
      for _,terrainTileInfo in pairs(box_1x1.getObjects())
        do
          if terrainTileInfo.name == "Irem Tower" then
            takeTile(box_1x1, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(iremCityPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Irem City" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(ambrosiaCloudPositions)
    do
      for _,terrainTileInfo in pairs(box_3x3.getObjects())
        do
          if terrainTileInfo.name == "Ambrosia Cloud" then
            takeTile(box_3x3, terrainTileInfo.index, terrainPosition, rotation)
            break
          end
        end
    end

  for _,terrainPosition in pairs(abandonedTemplePositions)
    do
      for _,terrainTileInfo in pairs(box_2x2.getObjects())
        do
          if terrainTileInfo.name == "Abandoned Temple" then
            takeTile(box_2x2, terrainTileInfo.index, terrainPosition, rotation)
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