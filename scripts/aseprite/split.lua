-- TOOL.3 — .aseprite → one RGBA PNG per frame, named by the frame's tag
-- (the constant name build.lua stamped) into --script-param dir.
--   aseprite -b X.aseprite --script-param dir=scratch/ase/X --script split.lua
local spr = app.sprite
local names = {}
for _, t in ipairs(spr.tags) do names[t.fromFrame.frameNumber] = t.name end
for i = 1, #spr.frames do
  local img = Image(spr.width, spr.height, ColorMode.RGB)
  img:drawSprite(spr, i)
  local name = names[i] or ('frame' .. i)
  img:saveAs(app.params.dir .. '/' .. name .. '.png')
  print(name)
end
