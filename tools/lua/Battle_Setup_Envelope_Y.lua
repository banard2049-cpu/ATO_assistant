function onload()
  -- clickable area
  self.createButton({
      click_function="oldHauntBattle", function_owner=self,
      position={-0.335748106241226, 0.210000216960907, -0.461854755878448}, height=60, width=280, color={1,1,1,0}, label=""
  })
end

function oldHauntBattle()
  broadcastToAll("Old Haunt Battle", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]

  local iremTowerPositions = {
    {-36.01, 1.30, 27.30},
    {-14.03, 1.30, 27.30},
    {-12.04, 1.30, 25.30},
    {-26.03, 1.30, 23.31},
    {-20.04, 1.30, 23.31},
    {-32.01, 1.30, 21.31},
    {-4.04, 1.30, 19.28},
    {-38.03, 1.30, 17.30},
    {-14.03, 1.30, 17.30},
    {-6.04, 1.30, 15.29},
    {-26.03, 1.30, 13.31},
    {-40.03, 1.30, 11.30},
    {-32.01, 1.30, 11.30},
    {-22.03, 1.30, 11.30},
    {-26.03, 1.30, 9.30},
    {-20.04, 1.30, 9.30},
    {-40.03, 1.30, 5.30},
    {-4.04, 1.30, 5.31},
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

function takeTile(container, tileIndex, pos, rot)
  container.takeObject({
    index = tileIndex,
    position = pos,
    rotation = rot
  })
end