function onload()
  -- clickable area
  self.createButton({
      click_function="clearAfterBattle", function_owner=self,
      position={0.019811630249023, 0.210000276565552, 0.008137689903378}, height=600, width=1600, color={1,1,1,0}, label=""
  })
end

function clearAfterBattle()
	clearTiles()
	clearTriskelions()
  removeTemporaryElem()
end

function clearTriskelions()
	local triskelions = getObjectsWithTag("Triskelion")
	for _,triskelion in ipairs(triskelions) do
		triskelion.setVar("countRage", 0)
		triskelion.setVar("countFate", 0)
		triskelion.setVar("countDanger", 0)
		triskelion.call("updateDisplayRage")
		triskelion.call("updateDisplayFate")
		triskelion.call("updateDisplayDanger")
	end
end

function clearTiles()
  broadcastToAll("Clear board", {1, 1, 1})
  local box_1x1 = getObjectsWithTag("boxTile_1x1")[1]
  local box_2x2 = getObjectsWithTag("boxTile_2x2")[1]
  local box_3x3 = getObjectsWithTag("boxTile_3x3")[1]
  local box_Z = getObjectsWithTag("boxTile_Z")[1]
  local box_4x1 = getObjectsWithTag("boxTile_4x1")[1]
  local box_5x1 = getObjectsWithTag("boxTile_5x1")[1]
  local box_2x1 = getObjectsWithTag("boxTile_2x1")[1]
  local box_L = getObjectsWithTag("boxTile_L")[1]

  local temporaryObjects = getObjectsWithTag("tile_1x1")
  for _,obj in pairs(temporaryObjects)
    do
      box_1x1.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_2x2")
  for _,obj in pairs(temporaryObjects)
    do
      box_2x2.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_3x3")
  for _,obj in pairs(temporaryObjects)
    do
      box_3x3.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_Z")
  for _,obj in pairs(temporaryObjects)
    do
      box_Z.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_4x1")
  for _,obj in pairs(temporaryObjects)
    do
      box_4x1.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_5x1")
  for _,obj in pairs(temporaryObjects)
    do
      box_5x1.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_2x1")
  for _,obj in pairs(temporaryObjects)
    do
      box_2x1.putObject(obj)
    end

  temporaryObjects = getObjectsWithTag("tile_L")
  for _,obj in pairs(temporaryObjects)
    do
      box_L.putObject(obj)
    end
end

function removeTemporaryElem()
  local temporaryObjects = getObjectsWithTag("temporary")
  for _,object in ipairs(temporaryObjects) do
    object.destruct()
  end
end