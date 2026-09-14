-- TOOL.3 — PNG frames + GIMP palette → one indexed .aseprite, one frame per
-- constant, each frame tagged with its constant name so split.lua can name
-- the PNGs on the way back. Called by scripts/sprite-io.mjs:
--   aseprite -b --script-param pngs=a.png;b.png --script-param names=A;B
--            --script-param pal=x.gpl --script-param out=X.aseprite --script build.lua
-- oneFrame matters: BODY_DARK.d0.png + BODY_DARK.d1.png is otherwise
-- auto-loaded as a numbered image sequence (two frames in one Sprite), which
-- gave a six-constant build seven frames and shifted every tag by one.
local function split(s) local t = {} for p in string.gmatch(s, '[^;]+') do t[#t + 1] = p end return t end
local pngs, names = split(app.params.pngs), split(app.params.names)

local spr = Sprite{ fromFile = pngs[1], oneFrame = true }
for i = 2, #pngs do
  local f = Sprite{ fromFile = pngs[i], oneFrame = true }
  local cel = f.cels[1]
  spr:newCel(spr.layers[1], spr:newEmptyFrame(#spr.frames + 1), cel.image, cel.position)
  f:close()
end
for i, n in ipairs(names) do spr:newTag(i, i).name = n end

spr:setPalette(Palette{ fromFile = app.params.pal })
app.sprite = spr
app.command.ChangePixelFormat{ format = 'indexed', dithering = 'none' }
spr.transparentColor = 0
spr:saveAs(app.params.out)
print(app.params.out .. ' ' .. #spr.frames .. ' frames, ' .. tostring(spr.colorMode == ColorMode.INDEXED and 'indexed' or 'NOT indexed') .. ', ' .. #spr.palettes[1] .. ' colours')
