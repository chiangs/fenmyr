# Myra's art, drawn in code: her stickers, the pixel stamp set and the app icon.
#   python3 assets/art/make_art.py        (from the repo root; needs Pillow)
# Writes web/stamps/myra*.png|gif, web/stamps/px/*.png and assets/icon.png.
# All of it is Myra's own art (see TRADEMARKS.md). The shapes are described as geometry and turned into
# 16x16 pixels with a light top-left, a darker bottom-right and a few highlights, so the set stays consistent.
import math, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAMPS = os.path.join(ROOT, 'web', 'stamps')

# the Nordic palette: (light, base, dark) for each
TONE = {
    'lingon': ('#f6a596', '#dc4b3e', '#a8322a'),
    'cloud': ('#ffe0a0', '#f6a63c', '#c46d16'),
    'moss': ('#c3e3ad', '#6fae5a', '#3f7d3a'),
    'fjord': ('#c4ddf3', '#4f8fc9', '#2f6299'),
    'heather': ('#e6d9f6', '#a98ad6', '#7556a8'),
    'birch': ('#fbf6ee', '#e8dccb', '#b8a68c'),
    'snow': ('#ffffff', '#ffffff', '#d9d2c6'),
    'ink': ('#4a3220', '#2a1708', '#1a0e05'),
}
INK = '#2a1708'

# ---------- turning shapes into shaded pixels ----------
def raster(mask, n=16):
    return [[mask(x + .5, y + .5) for x in range(n)] for y in range(n)]

def shade(cells, tone, layer):
    """paint a mask in one tone: dark where it borders empty space down/right, light where it borders up/left"""
    lt, base, dk = TONE[tone]; n = len(cells)
    on = lambda x, y: 0 <= x < n and 0 <= y < n and cells[y][x]
    for y in range(n):
        for x in range(n):
            if not cells[y][x]: continue
            c = base
            if not on(x + 1, y) or not on(x, y + 1): c = dk
            elif (not on(x - 1, y) or not on(x, y - 1)) and on(x + 1, y + 1): c = lt
            layer[y][x] = c

def flat(cells, color, layer):
    for y, row in enumerate(cells):
        for x, v in enumerate(row):
            if v: layer[y][x] = color

def bitmap(rows, ox, oy, color, layer):
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.' and 0 <= oy + y < len(layer) and 0 <= ox + x < len(layer[0]): layer[oy + y][ox + x] = color

def blank(n=16): return [[None] * n for _ in range(n)]

def save(layer, path, size=128):
    n = len(layer); px = size // n; im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    off = (size - px * n) // 2
    for y, row in enumerate(layer):
        for x, c in enumerate(row):
            if c: d.rectangle([off + x * px, off + y * px, off + (x + 1) * px - 1, off + (y + 1) * px - 1], fill=c)
    im.save(path)

circle = lambda cx, cy, r: (lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= r * r)
def poly(pts):
    def inside(x, y):
        c = False
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
        return c
    return inside
def segs(points, w):   # a thick line through points
    def near(x, y):
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            dx, dy = x2 - x1, y2 - y1; t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy or 1)))
            if math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= w / 2: return True
        return False
    return near
def heartm(cx=8, cy=8.6, s=6.6):
    def m(x, y):
        u, v = (x - cx) / s, -(y - cy) / s * 1.08
        return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0
    return m
def star_pts(cx, cy, R, r, k=5, rot=-90):
    return [(cx + (R if i % 2 == 0 else r) * math.cos(math.radians(rot + i * 180 / k)), cy + (R if i % 2 == 0 else r) * math.sin(math.radians(rot + i * 180 / k))) for i in range(2 * k)]

# ---------- the stamps (16 to start; other emoji show as your system's emoji) ----------
def st_heart(tone):
    L = blank(); shade(raster(heartm()), tone, L); bitmap(['WW', 'W.'], 4, 4, '#ffffff', L); return L
def st_star():
    L = blank(); shade(raster(poly(star_pts(8, 8.6, 7.6, 3.4))), 'cloud', L); bitmap(['W'], 7, 4, '#ffffff', L); return L
def badge(tone, glyph):
    L = blank(); shade(raster(circle(8, 8, 7.2)), tone, L); flat(raster(glyph), '#ffffff', L); return L
def st_check(): return badge('moss', segs([(4.3, 8.4), (7, 11), (11.8, 5.2)], 2.1))
def st_cross(): return badge('lingon', lambda x, y: segs([(5, 5), (11, 11)], 2.2)(x, y) or segs([(11, 5), (5, 11)], 2.2)(x, y))
def st_question():
    L = blank(); shade(raster(circle(8, 8, 7.2)), 'fjord', L)
    bitmap(['.WWW.', 'W...W', '....W', '...W.', '..W..', '.....', '..W..'], 6, 4, '#ffffff', L); return L
def st_exclaim():
    L = blank(); shade(raster(circle(8, 8, 7.2)), 'lingon', L)
    bitmap(['WW', 'WW', 'WW', 'WW', 'WW', '..', 'WW'], 7, 4, '#ffffff', L); return L
def st_bulb():
    L = blank(); shade(raster(circle(8, 6.6, 5.4)), 'cloud', L); shade(raster(lambda x, y: 5.5 <= x <= 10.5 and 11 <= y <= 15), 'birch', L)
    flat(raster(lambda x, y: 6 <= x <= 10 and 12.6 <= y <= 13.4), TONE['birch'][2], L); bitmap(['WW', 'W.'], 5, 3, '#ffffff', L); return L
def st_fire():
    L = blank()
    shade(raster(poly([(8, .8), (12.6, 6.5), (13.6, 10.5), (11.6, 14.4), (4.4, 14.4), (2.4, 10.5), (4.2, 6.2), (6, 8.2)])), 'lingon', L)
    shade(raster(poly([(8.2, 6), (10.8, 9.8), (10.6, 13.6), (5.4, 13.6), (5.2, 10.4), (6.6, 11)])), 'cloud', L); return L
def st_pushpin():
    L = blank(); flat(raster(segs([(8, 8), (5, 15)], 1.2)), TONE['ink'][1], L); shade(raster(circle(9, 6, 5)), 'lingon', L); bitmap(['WW', 'W.'], 7, 3, '#ffffff', L); return L
def st_coffee():
    L = blank(); shade(raster(lambda x, y: (2.5 <= x <= 11.5 and 6 <= y <= 14.5)), 'birch', L)
    flat(raster(lambda x, y: (abs(math.hypot(x - 12.2, y - 9.8) - 2.2) < .9 and x > 11.5)), TONE['birch'][2], L)
    flat(raster(lambda x, y: 3.5 <= x <= 10.5 and 6 <= y <= 7.2), TONE['cloud'][2], L)
    for sx in (5, 9): flat(raster(segs([(sx, 4.5), (sx + 1, 3), (sx, 1.5)], .9)), TONE['birch'][2], L)
    return L
def st_target():
    L = blank(); shade(raster(circle(8, 8, 7.4)), 'lingon', L); flat(raster(circle(8, 8, 5.3)), '#ffffff', L)
    flat(raster(circle(8, 8, 3.4)), TONE['lingon'][1], L); flat(raster(circle(8, 8, 1.4)), '#ffffff', L); return L
def st_speech():
    L = blank(); shade(raster(lambda x, y: (1.5 <= x <= 14.5 and 2.5 <= y <= 11.5 and not ((x < 2.6 or x > 13.4) and (y < 3.6 or y > 10.4))) or poly([(4, 11), (8, 11), (3.5, 14.8)])(x, y)), 'snow', L)
    for cx in (5, 8, 11): flat(raster(circle(cx, 7, 1.1)), INK, L)
    return L
def st_blossom():
    L = blank(); m = lambda x, y: any(circle(8 + 4 * math.cos(math.radians(a)), 8.3 + 4 * math.sin(math.radians(a)), 3.3)(x, y) for a in range(-90, 270, 72))
    shade(raster(m), 'heather', L); shade(raster(circle(8, 8.3, 2)), 'cloud', L); return L
def st_sparkles():
    L = blank(); shade(raster(poly(star_pts(6.6, 8.6, 6.6, 1.8, 4, -90))), 'cloud', L); shade(raster(poly(star_pts(12.6, 3.6, 3.2, 1, 4, -90))), 'cloud', L); return L
def st_rainbow():
    L = blank()
    for r, tone in ((7.6, 'lingon'), (6.2, 'cloud'), (4.8, 'moss'), (3.4, 'fjord')):
        flat(raster(lambda x, y, r=r: math.hypot(x - 8, y - 12) <= r and y <= 12), TONE[tone][1], L)
    flat(raster(lambda x, y: math.hypot(x - 8, y - 12) < 2 and y <= 12), None, L)
    for cx in (3.2, 12.8): shade(raster(lambda x, y, cx=cx: circle(cx - 1, 12.6, 1.8)(x, y) or circle(cx + 1, 12.6, 1.8)(x, y) or circle(cx, 11.4, 1.8)(x, y)), 'snow', L)
    return L

STAMP_SET = {
    'heart': lambda: st_heart('lingon'), 'blueheart': lambda: st_heart('fjord'), 'star': st_star, 'check': st_check, 'cross': st_cross,
    'question': st_question, 'exclaim': st_exclaim, 'bulb': st_bulb, 'fire': st_fire, 'pushpin': st_pushpin, 'coffee': st_coffee,
    'target': st_target, 'speech': st_speech, 'blossom': st_blossom, 'sparkles': st_sparkles, 'rainbow': st_rainbow,
}

# ---------- Myra herself (the same pixels as web/goo.js) ----------
SIL = ['................', '................', '................', '................',
       '.....XX..XX.....', '...XXXXXXXXXX...', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XXXXXXXXXXXXXX.',
       'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '...XX.XXXX.XX...']
LEAVES = {(6, 0): 'l', (9, 0): 'l', (3, 1): 'l', (4, 1): 'L', (5, 1): 'L', (6, 1): 'l', (9, 1): 'l', (10, 1): 'L', (11, 1): 'L', (12, 1): 'l',
          (4, 2): 'l', (5, 2): 'L', (6, 2): 'L', (7, 2): 'l', (8, 2): 'l', (9, 2): 'L', (10, 2): 'L', (11, 2): 'l', (6, 3): 'l', (7, 3): 'l', (8, 3): 'l', (9, 3): 'l'}
GOLD = {'B': '#f6a63c', 'S': '#ffe0a0', 's': '#fbc66e', 'D': '#de8526', 'd': '#ad6820', 'L': '#7cc95e', 'l': '#3f8f3c'}

def myra_cells():
    out = {}
    for y, row in enumerate(SIL):
        for x, c in enumerate(row):
            if (x, y) in LEAVES: out[(x, y)] = LEAVES[(x, y)]; continue
            if c != 'X': continue
            if y == 14 or SIL[y + 1][x] != 'X': out[(x, y)] = 'd'; continue
            off = (y // 3) % 2 * 2
            out[(x, y)] = 'S' if y % 3 == 1 and (x + off) % 4 == 1 else 's' if y % 3 == 1 and (x + off) % 4 == 2 else 'D' if y % 3 == 0 and (x + off) % 4 == 3 else 'B'
    return out

EYES = {
    'normal': {(4, 8), (4, 9), (11, 8), (11, 9)},
    'happy': {(3, 9), (4, 8), (5, 9), (10, 9), (11, 8), (12, 9)},
    'closed': {(3, 9), (4, 9), (5, 9), (10, 9), (11, 9), (12, 9)},
    'half': {(3, 9), (4, 9), (5, 9), (10, 9), (11, 9), (12, 9), (4, 8), (11, 8)},
}
def sticker(mood, sy=1.0, lift=0):
    """Myra in a mood, on a 22x22 pixel grid (room for hats, z's and tears), returned as {(x, y): color}"""
    cells = {(x + 3, y + 5): GOLD[c] for (x, y), c in myra_cells().items()}
    def put(pts, color):
        for (x, y) in pts: cells[(x + 3, y + 5)] = color
    blush = {(2, 10), (13, 10)}
    smile = {(7, 11), (8, 11)}
    eyes = EYES['normal']
    if mood == 'happy': eyes = EYES['happy']; smile = {(6, 11), (7, 12), (8, 12), (9, 11)}
    if mood == 'love':
        eyes = set(); smile = {(6, 11), (7, 12), (8, 12), (9, 11)}
        for ex in (3, 10): put({(ex, 8), (ex + 2, 8), (ex, 9), (ex + 1, 9), (ex + 2, 9), (ex + 1, 10)}, TONE['lingon'][1])
    if mood == 'sleepy': eyes = EYES['closed']; smile = {(7, 11), (8, 11)}
    if mood == 'sigh': eyes = EYES['half']; smile = {(7, 11), (8, 11), (9, 11)}
    if mood == 'cry': smile = {(7, 11), (8, 11), (6, 12), (9, 12)}
    if mood == 'shook':
        eyes = set(); smile = {(7, 11), (8, 11), (7, 12), (8, 12)}
        for ex in (3, 10): put({(ex, 7), (ex + 1, 7), (ex, 8), (ex + 1, 8), (ex, 9), (ex + 1, 9)}, '#ffffff'); put({(ex + 1, 8)}, INK)
    if mood == 'wave': eyes = EYES['happy']; smile = {(6, 11), (7, 12), (8, 12), (9, 11)}
    put(eyes, INK); put(blush, '#ff8fa8'); put(smile, GOLD['d'] if mood != 'shook' else INK)
    if mood == 'cry': put({(4, 10), (4, 11), (3, 12), (11, 10), (11, 11), (12, 12)}, TONE['fjord'][1])
    if mood == 'shook': put({(15, 3), (15, 4), (16, 4), (15, 5)}, TONE['fjord'][0])
    if mood == 'sleepy':   # a big z and a little z
        for (zx, zy, rows) in ((13, 1, ['ZZZZ', '..Z.', '.Z..', 'ZZZZ']), (17, -3, ['ZZZ', '.Z.', 'ZZZ'])):
            put({(zx + x, zy + y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'Z'}, TONE['fjord'][2])
    if mood == 'sigh':   # a little puff of air
        puff = ['.OOO.', 'OWWWO', 'OWWWW', 'OWWWO', '.OOO.']
        put({(14 + x, 9 + y) for y, r in enumerate(puff) for x, ch in enumerate(r) if ch == 'W'}, TONE['fjord'][0])
        put({(14 + x, 9 + y) for y, r in enumerate(puff) for x, ch in enumerate(r) if ch == 'O'}, TONE['birch'][2])
    if mood == 'wave':
        put({(16, 5), (17, 4), (17, 5), (18, 3), (18, 4), (16, 6), (15, 7)}, GOLD['L']); put({(17, 3), (18, 2)}, GOLD['l'])
    if mood == 'party':
        hat = {(7 + dx, -5 + dy) for dy in range(5) for dx in range(-dy // 2, dy // 2 + 2)}
        put(hat, TONE['heather'][1]); put({(7, -1), (8, -1), (6, -1), (9, -1), (7, -3), (8, -3)}, TONE['cloud'][0]); put({(7, -6), (8, -6)}, TONE['cloud'][1])
        for (cx, cy, c) in ((1, 2, 'lingon'), (14, 1, 'fjord'), (16, 7, 'moss'), (-1, 8, 'cloud'), (0, 4, 'heather')): put({(cx, cy)}, TONE[c][1])
    if sy != 1.0 or lift:   # squash and stretch for the bounce, feet on the ground: each new row takes the nearest old row (no gaps)
        base, ys = 19, [y for (_, y) in cells]
        out = {}
        for ty in range(min(ys) - 4, base + 1):
            sy_ = round(base - (base - ty) / sy)
            for (x, y), c in cells.items():
                if y == sy_: out[(x, ty - lift)] = c
        cells = out
    return cells

def save_cells(cells, path, size=128, n=22, im_list=None):
    px = size // n; im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im); off = (size - px * n) // 2
    for (x, y), c in cells.items():
        if 0 <= x < n and 0 <= y < n: d.rectangle([off + x * px, off + y * px, off + (x + 1) * px - 1, off + (y + 1) * px - 1], fill=c)
    if im_list is not None: im_list.append(im); return im
    im.save(path); return im

def gif(frames, path, ms):
    # transparent GIF: the first palette slot is see-through
    pal = [f.convert('RGBA') for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=ms, loop=0, disposal=2, transparency=0, optimize=False)

def icon(path, size=1024):
    """the app icon: Myra on a warm birch squircle"""
    s = 4; S = size * s; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pad, r = int(S * .06), int(S * .23)
    d.rounded_rectangle([pad, pad + int(S * .012), S - pad, S - pad + int(S * .012)], r, fill=(196, 109, 22, 70))   # a warm shadow
    d.rounded_rectangle([pad, pad, S - pad, S - pad], r, fill='#fbf3e6')
    d.rounded_rectangle([pad, int(S * .62), S - pad, S - pad], r, fill='#f3e6d2'); d.rectangle([pad, int(S * .62), S - pad, int(S * .62) + r], fill='#f3e6d2')
    cells = sticker('normal'); px = int(S * .036); n = 22; off = (S - px * n) // 2
    for (x, y), c in cells.items(): d.rectangle([off + x * px, off + y * px - int(S * .03), off + (x + 1) * px - 1, off + (y + 1) * px - 1 - int(S * .03)], fill=c)
    im.resize((size, size), Image.LANCZOS).save(path)

if __name__ == '__main__':
    os.makedirs(os.path.join(STAMPS, 'px'), exist_ok=True)
    for name, fn in STAMP_SET.items(): save(fn(), os.path.join(STAMPS, 'px', name + '.png'))
    for mood in ('normal', 'happy', 'love', 'party', 'wave', 'shook', 'sleepy', 'cry', 'sigh'):
        save_cells(sticker(mood), os.path.join(STAMPS, 'myra.png' if mood == 'normal' else f'myra-{mood}.png'))
    fr = []
    for sy, lift in ((1, 0), (.86, 0), (1.06, 2), (1.0, 4), (1.04, 2), (.92, 0)): save_cells(sticker('happy', sy, lift), None, im_list=fr)
    gif(fr, os.path.join(STAMPS, 'myra-bounce.gif'), 110)
    fr = []
    for m in ('normal', 'normal', 'half', 'sigh', 'sigh', 'half'): save_cells(sticker(m), None, im_list=fr)
    gif(fr, os.path.join(STAMPS, 'myra-sigh.gif'), 260)
    icon(os.path.join(ROOT, 'assets', 'icon.png'))
    print('made', len(STAMP_SET), 'stamps, 9 stickers, 2 animations and the icon')
