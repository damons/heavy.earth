#!/usr/bin/env python3
"""Generate the print template and synthetic fixtures from the shared JS grid.
Requires Node and reportlab. No changes to original or user-supplied artwork.
"""
import base64
import json
import struct
import subprocess
import zlib
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

ROOT = Path(__file__).resolve().parents[1]
geometry = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {PANEL,panelGridSegments} from './game/web/grid.js'; console.log(JSON.stringify({panel:PANEL,lines:panelGridSegments()}));"
], cwd=ROOT, text=True))
PANEL, LINES = geometry['panel'], geometry['lines']
SIZE = PANEL['inches']
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="8in" height="8in" viewBox="0 0 8 8">',
       '<title>HEAVY.EARTH HE8 grid - TOP is the upper edge; print at 100 percent</title>',
       '<desc>8 inch square. Diamonds are 1 inch wide and 0.5 inch high. Origin is the top-left corner. All panels use this same grid without rotation.</desc>',
       '<rect width="8" height="8" fill="white"/>',
       '<g stroke="#999" stroke-width="0.004" fill="none">']
for line in LINES:
    (x1,y1),(x2,y2) = line['a'],line['b']
    svg.append(f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}"/>')
svg += ['</g>', '<rect x="0" y="0" width="8" height="8" stroke="#333" stroke-width="0.007" fill="none"/>', '</svg>']
(ROOT/'game/web/panel-grid.svg').write_text('\n'.join(svg)+'\n')

out = ROOT/'output/pdf/heavy-earth-8x8-template.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=letter, invariant=1)
c.setTitle('HEAVY.EARTH - interchangeable 8-inch panel template')
c.setAuthor('HEAVY.EARTH')

def text(x,y,words,size=9,font='Helvetica',gray=.2):
    c.setFillGray(gray);c.setFont(font,size);c.drawString(x,y,words)
def centered(x,y,words,size=9,font='Helvetica',gray=.2):
    c.setFillGray(gray);c.setFont(font,size);c.drawCentredString(x,y,words)
def grid(left,bottom,scale=72):
    c.setStrokeGray(.64);c.setLineWidth(.28)
    for line in LINES:
        (x1,y1),(x2,y2) = line['a'],line['b']
        c.line(left+x1*scale,bottom+(SIZE-y1)*scale,left+x2*scale,bottom+(SIZE-y2)*scale)
    c.setStrokeGray(.18);c.setLineWidth(.55);c.rect(left,bottom,SIZE*scale,SIZE*scale)
def arrow(x, y):
    c.setStrokeGray(.15);c.setLineWidth(.8);c.line(x,y,x,y+12);c.line(x,y+12,x-3,y+8);c.line(x,y+12,x+3,y+8)

text(36,756,'HEAVY.EARTH / HE8',12,'Helvetica-Bold')
text(36,737,'One template. Every panel. Keep the marked TOP edge up.',10)
text(36,719,'8 x 8 in panel  |  1 x 1/2 in diamonds  |  exact 2:1 slope (26.565 degrees)',9)
# Exact 576-point square, with 18-point side margins on US Letter.
grid(18,108)
arrow(306,689);centered(332,695,'TOP',8,'Helvetica-Bold')
text(36,85,'PRINT AT ACTUAL SIZE / 100%. Turn OFF Fit, Shrink and borderless expansion.',9,'Helvetica-Bold')
text(36,70,'Measure the square: exactly 8 inches on both sides. Do not trace a scaled print.',9)
text(36,55,'Crop or trace on the square border. Mark TOP on the back of every physical panel.',9)
text(36,32,'Scale check:',8)
c.setStrokeGray(0);c.setLineWidth(.8);c.line(100,35,172,35);c.line(100,31,100,39);c.line(172,31,172,39)
text(182,32,'This line must measure exactly 1 inch.',8)
text(460,32,'HE8-2to1-1in-v1',8,'Courier')
c.showPage()

text(36,756,'ASSEMBLY PROOF / REDUCED SCALE',12,'Helvetica-Bold')
text(36,735,'Four copies of the same template. Labels represent arbitrary dungeon panels.',9)
text(36,718,'Reorder the panels freely; keep TOP up and their physical edges flush.',9)
scale=28.8;left=75.6;bottom=174;side=SIZE*scale
for row in range(2):
    for col in range(2):
        x=left+col*side;y=bottom+(1-row)*side
        grid(x,y,scale)
        # Labels sit inside each board, away from the seam intersections.
        c.setFillGray(1);c.rect(x+side/2-38,y+side-35,76,25,fill=1,stroke=0)
        centered(x+side/2,y+side-20,f'PANEL {"ABCD"[row*2+col]}  /  TOP',8,'Helvetica-Bold')
c.setStrokeGray(0);c.setLineWidth(1.1)
c.line(left+side,bottom,left+side,bottom+2*side)
c.line(left,bottom+side,left+2*side,bottom+side)
text(36,143,'Horizontal adjacency: 8 inches = 8 horizontal grid repeats.',10)
text(36,125,'Vertical adjacency: 8 inches = 16 vertical grid repeats.',10)
text(36,101,'The grid is periodic in both directions. Every panel uses the same corner origin.',9)
text(36,85,'Matching grid lines do not imply matching doors or tunnels; author those deliberately.',9)
text(36,55,'This page is a reduced assembly illustration. Use page 1 for the full-size tracing template.',8,'Helvetica-Bold')
c.save()

# Synthetic scan generated in canonical coordinates, not a conversion of old art.
n = PANEL['previewPixels'];pitch=PANEL['pitchPixels'];raw=bytearray()
for py in range(n):
    raw.append(0)
    for px in range(n):
        u=px/pitch+2*py/pitch;v=2*py/pitch-px/pitch
        floor=(7<=u<19 and 0<=v<11 and (8<=u<11 or 5<=v<8 or (13<=u<18 and 0<=v<3)))
        value=242 if floor else 20
        if floor and (u%1<.018 or v%1<.018):value=175
        raw.append(value)
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
(ROOT/'game/tests/fixtures/panel-scan.png').write_bytes(png)
art='data:image/png;base64,'+base64.b64encode(png).decode()
panels=[]
for i, name in enumerate(['Western passage','Eastern passage']):
    panels.append({'id':f'example-panel-{i+1}','name':name,'inches':8,'pitch':100,'origin':[0,0],'top':'up',
        'assembly':[i,0],'threshold':150,'art':art,'cells':[{'x':9,'y':6,'kind':'open'}],
        'connectors':[{'id':f'example-passage-{i+1}','x':9,'y':6,'direction':'east' if i==0 else 'west','target':f'example-passage-{2-i}'}]})
draft={'format':'heavy-earth-panel-draft','version':2,'projection':{'standard':PANEL['standard'],'ratio':'2:1','previewPixels':n,'tileWidthInches':1},'panels':panels}
(ROOT/'examples/two-panel-draft.json').write_text(json.dumps(draft,indent=2)+'\n')
print(f'Generated {out}, canonical SVG, and HE8 synthetic example assets.')
