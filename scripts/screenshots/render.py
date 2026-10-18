"""Render a drive.py screen capture (<name>.json) to SVG. Usage: render.py <in.json> <out.svg>

Reads PSTASH_SHOTS, to shorten the demo project's path to ~/code/my-app, and PSTASH_REPO,
to show the picker's version as an installed copy draws it.
"""
import json, os, sys
from html import escape

CW, CH, PAD = 8.6, 19, 18
BG, FG = '#16161a', '#d4d4d8'
NAMED = {
    'black': '#3f3f46', 'red': '#f87171', 'green': '#4ade80', 'brown': '#facc15', 'yellow': '#facc15',
    'blue': '#60a5fa', 'magenta': '#c084fc', 'cyan': '#22d3ee', 'white': '#e4e4e7',
    'brightblack': '#71717a', 'brightred': '#fca5a5', 'brightgreen': '#86efac', 'brightyellow': '#fde68a',
    'brightblue': '#93c5fd', 'brightmagenta': '#d8b4fe', 'brightcyan': '#67e8f9', 'brightwhite': '#fafafa',
}
VERSION = json.load(open(f"{os.environ['PSTASH_REPO']}/.claude-plugin/plugin.json"))['version']
APP = os.path.realpath(f"{os.environ['PSTASH_SHOTS']}/my-app")

# Block elements as filled boxes (fractions of a cell), so the logo has no gaps
# between rows the way font glyphs leave them.
TL, TR, BL, BR = (0, 0, .5, .5), (.5, 0, 1, .5), (0, .5, .5, 1), (.5, .5, 1, 1)
BLOCKS = {
    '█': [(0, 0, 1, 1)], '▀': [(0, 0, 1, .5)], '▄': [(0, .5, 1, 1)], '▌': [(0, 0, .5, 1)], '▐': [(.5, 0, 1, 1)],
    '▘': [TL], '▝': [TR], '▖': [BL], '▗': [BR], '▚': [TL, BR], '▞': [TR, BL],
    '▛': [TL, TR, BL], '▜': [TL, TR, BR], '▙': [TL, BL, BR], '▟': [TR, BL, BR],
}


def color(value, default):
    if value == 'default':
        return default
    if value in NAMED:
        return NAMED[value]
    return f'#{value}' if len(value) == 6 else default


rows = json.load(open(sys.argv[1]))
# start at the logo; drop the user's settings warnings above it
start = next(i for i, row in enumerate(rows) if '▐▛' in ''.join(c[0] for c in row))
rows = rows[start:]
# cosmetic: drop the notice about this demo sharing a name with the parent session
rows = [r for r in rows if 'Another live session' not in ''.join(c[0] for c in r)]
# collapse runs of blank rows to one
kept = []
for row in rows:
    blank = not ''.join(c[0] for c in row).strip()
    if blank and kept and kept[-1][1]:
        continue
    kept.append((row, blank))
while kept and kept[-1][1]:
    kept.pop()
rows = [r for r, _ in kept]


# cosmetic: drop the session label inherited from the parent session, shorten the demo path
def swap(row, old, new):
    text = ''.join(c[0] for c in row)
    at = text.find(old)
    if at < 0:
        return
    new = new.ljust(len(old), new[-1] if new and new[-1] == '─' else ' ')
    for i, ch in enumerate(new):
        row[at + i][0] = ch


for row in rows:
    text = ''.join(c[0] for c in row)
    if text.lstrip().startswith('─') and ' ─' in text.rstrip()[-2:] + ' ─':
        label = text.rstrip()
        cut = label.rfind('── ')
        if cut > 0 and not label[cut + 3:].startswith('─'):
            swap(row, label[cut + 2:], '─' * (len(label) - cut - 2))
            plain = next(c for c in row if c[0] == '─')
            for c in row[cut:len(label)]:
                c[1:] = plain[1:]  # border style over the old label's
    swap(row, APP, '~/code/my-app')
    swap(row, ' · Amazon Bedrock', '')
    swap(row, 'v' + VERSION + ' · local', ('v' + VERSION).rjust(len(VERSION) + 9))  # README shows the installed look

cols = len(rows[0])
width, height = cols * CW + 2 * PAD, len(rows) * CH + 2 * PAD + 22
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}">',
       f'<rect width="100%" height="100%" rx="10" fill="{BG}"/>']
for i, dot in enumerate(['#ff5f57', '#febc2e', '#28c840']):
    out.append(f'<circle cx="{PAD + 6 + i * 20}" cy="{PAD}" r="6" fill="{dot}"/>')
top = PAD + 22
out.append(f'<g font-family="Menlo, monospace" font-size="14.3" xml:space="preserve">')
for y, row in enumerate(rows):
    x = 0
    while x < cols:
        ch, fg, bg, bold, reverse, italic = row[x]
        run = [ch]
        nx = x + 1
        while nx < cols and row[nx][1:] == row[x][1:]:
            run.append(row[nx][0])
            nx += 1
        # the logo's dark cells are pure black, which a black terminal hides; so does this
        fgc, bgc = color(fg, FG), (None if bg == '000000' else color(bg, None))
        if reverse:
            fgc, bgc = (bgc or BG), fgc
        px, py = PAD + x * CW, top + y * CH
        if bgc:
            out.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{len(run) * CW:.1f}" height="{CH}" fill="{bgc}"/>')
        for i, ch in enumerate(run):
            for x0, y0, x1, y1 in BLOCKS.get(ch, []):
                out.append(f'<rect x="{px + (i + x0) * CW:.2f}" y="{py + y0 * CH:.2f}" width="{(x1 - x0) * CW:.2f}" height="{(y1 - y0) * CH:.2f}" fill="{fgc}" shape-rendering="crispEdges"/>')
        text = ''.join(' ' if ch in BLOCKS else ch for ch in run)
        if text.strip():
            style = (' font-weight="bold"' if bold else '') + (' font-style="italic"' if italic else '')
            out.append(f'<text x="{px:.1f}" y="{py + CH * 0.75:.1f}" fill="{fgc}"{style} textLength="{len(run) * CW:.1f}" lengthAdjust="spacingAndGlyphs">{escape(text)}</text>')
        x = nx
out.append('</g></svg>')
open(sys.argv[2], 'w').write('\n'.join(out))
