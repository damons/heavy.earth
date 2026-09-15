#!/usr/bin/env python3
"""Capture DOS wall/room clipping and light recognition without screen I/O."""
import hashlib,json,random
from pathlib import Path
from oracle import Oracle
ROOT=Path(__file__).resolve().parents[2]
o=Oracle();inputs=random.Random(1201);geometry=[];lighting=[]
for i in range(260):
 w=[[inputs.randrange(4) if i>=4 else i for y in range(4)] for x in range(4)]
 n=[[inputs.randrange(4) if i>=4 else i for y in range(4)] for x in range(4)]
 rooms=[[int(x<3 and y<3) for y in range(4)] for x in range(4)]
 locals=[]
 for base,values in [(-0x26,w),(-0x58,n),(-0x8a,rooms)]:
  for x in range(4):
   for y in range(4):locals.append((base+2*(5*x+y),values[x][y]))
 o.block(0xa9f,0x636,0x7f8,locals)
 def read(base):return [[o.word(0x3f00+base+2*(5*x+y)) for y in range(4)] for x in range(4)]
 geometry.append(dict(west=w,north=n,rooms=rooms,expected=dict(west=read(-0x26),north=read(-0x58),rooms=read(-0x8a))))
for seed in [1,42,0x12345678,0xdeadbeef,0xffffffff,987654321]:
 for light in [0,1,49,50,51,99,32767]:
  for continual in [False,True]:
   for center in [False,True]:
    o.dword(0xa530,seed);o.word(0x4cae,light);o.word(0x4cce,int(continual))
    o.word(0x3800-0x172,1 if center else 0);o.word(0x3800-0x174,1)
    o.block(0xa9f,0xe,0x83,[(4,0x3800)])
    lighting.append(dict(seed=seed,light=light,continual=continual,center=center,recognized=bool(o.word(0x3efe)&1),state=o.dword(0xa530)))
out=dict(provenance=dict(exe_sha256=hashlib.sha256((ROOT/'reference/dos/DND.EXE').read_bytes()).hexdigest(),method=__doc__,geometry='0a9f:0636–07f8',lighting='0a9f:000e–0083'),geometry=geometry,lighting=lighting)
(ROOT/'tests/fixtures/dos-visibility.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(len(geometry),'clipping cases;',len(lighting),'light recognition cases')
