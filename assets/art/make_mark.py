# Myra's little mark: a tiny colour font with one glyph, a cloudberry, standing in for ✦ (U+2726) wherever the app
# writes it, so every "Take the tour ✦" or "Saved ✦" shows a cloudberry without changing the words.
#   python3 assets/art/make_mark.py      (from the repo root; needs fontTools and brotli)
# Writes web/fonts/MyraMark.woff2. Part of Myra's own art (see TRADEMARKS.md).
import math, os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables import otTables
from fontTools.colorLib.builder import buildCOLR, buildCPAL

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPM = 1000

def circle(pen, cx, cy, r, n=8):
    # a circle from n quadratic arcs
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    k = r / math.cos(math.pi / n)
    ctrl = [(cx + k * math.cos(2 * math.pi * (i + .5) / n), cy + k * math.sin(2 * math.pi * (i + .5) / n)) for i in range(n)]
    pen.moveTo(pts[0])
    for i in range(n): pen.qCurveTo(ctrl[i], pts[(i + 1) % n])
    pen.closePath()

def glyph(draw):
    pen = TTGlyphPen(None); draw(pen); return pen.glyph()

# the berry: a cluster of round beads (drawn as separate contours so they read as bumps); the leaf crown on top
BEADS = [(500, 320, 120), (355, 300, 108), (645, 300, 108), (390, 165, 108), (610, 165, 108), (500, 470, 100), (360, 440, 95), (640, 440, 95), (500, 120, 105)]
def berry(pen):
    for (x, y, r) in BEADS: circle(pen, x, y - 40, r)
def shine(pen):
    for (x, y, r) in BEADS[:5]: circle(pen, x - r * .35, y - 40 + r * .35, r * .22, 6)
def leaves(pen):
    for side in (-1, 1):   # two leaves and a stem
        pen.moveTo((500, 560)); pen.qCurveTo((500 + side * 120, 720), (500 + side * 260, 640)); pen.qCurveTo((500 + side * 150, 560), (500, 560)); pen.closePath()
    pen.moveTo((480, 540)); pen.lineTo((520, 540)); pen.lineTo((530, 720)); pen.lineTo((490, 720)); pen.closePath()

names = ['.notdef', 'cloudberry', 'cb.berry', 'cb.shine', 'cb.leaf']
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({0x2726: 'cloudberry'})
empty = glyph(lambda p: None)
fb.setupGlyf({'.notdef': empty, 'cloudberry': glyph(lambda p: (berry(p), leaves(p))), 'cb.berry': glyph(berry), 'cb.shine': glyph(shine), 'cb.leaf': glyph(leaves)})
fb.setupHorizontalMetrics({n: (760, 0) for n in names})
fb.setupHorizontalHeader(ascent=820, descent=-180)
fb.setupNameTable({'familyName': 'Myra Mark', 'styleName': 'Regular', 'copyright': 'Copyright 2026 Stephen Chiang. Part of Myra (all rights reserved; see TRADEMARKS.md).'})
fb.setupOS2(sTypoAscender=820, sTypoDescender=-180, usWinAscent=820, usWinDescent=180)
fb.setupPost()
# the glyph is drawn in Myra's colours (COLR/CPAL); the plain outline above is the fallback
fb.font['CPAL'] = buildCPAL([[(0xf6 / 255, 0xa6 / 255, 0x3c / 255, 1), (1, 0xe0 / 255, 0xa0 / 255, 1), (0x5f / 255, 0xb0 / 255, 0x4c / 255, 1)]])
fb.font['COLR'] = buildCOLR({'cloudberry': [('cb.berry', 0), ('cb.shine', 1), ('cb.leaf', 2)]})
# center it a touch lower so it sits on the line like ✦ did
for n in ('cloudberry', 'cb.berry', 'cb.shine', 'cb.leaf'):
    g = fb.font['glyf'][n]
    if g.numberOfContours: g.coordinates.translate((-120, 0)); g.recalcBounds(fb.font['glyf'])
fb.font.flavor = 'woff2'
out = os.path.join(ROOT, 'web', 'fonts', 'MyraMark.woff2')
fb.save(out); print('wrote', out, os.path.getsize(out), 'bytes')
