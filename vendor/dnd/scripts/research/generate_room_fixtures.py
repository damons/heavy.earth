#!/usr/bin/env python3
"""Execute original fountain, pit and hazard routines with synthetic player state."""
import json,hashlib
from pathlib import Path
from spell_oracle import SpellOracle
from inspect_exe import body,md
from oracle import UC_X86_REG_BP,UC_X86_REG_EFLAGS
ROOT=Path(__file__).resolve().parents[2]
o=SpellOracle()
for seg,size in [(0x2d4,0x6f7),(0x139,0x400),(0x343,0xe49)]:
 for ins in md.disasm(body[seg*16:seg*16+size],0):
  if ins.mnemonic=='lcall':
   s,f=[int(x,16) for x in ins.op_str.split(', ')]
   if s in (0x12e0,0x1318,0x13aa):
    ret=next(i for i in md.disasm(body[s*16+f:s*16+f+2000],f) if i.mnemonic=='retf')
    n=int(ret.op_str or '0',0);o.intercept(s,f,lambda o,n=n:o.ret(n))
o.intercept(0xa9f,0xce1,lambda o:o.ret()) # status redraw only
fountains=[];hazards=[];pits=[]
def setup(seed,cls,depth):
 o.setup(seed,cls);o.write(0x4c8c,bytes([depth]));o.dword(0x4c8e,4321)
 for i in range(4):o.word(0x4c9e+i*2,0);o.word(0x4ca6+i*2,0)
 o.call(0xf9f,0x85d,[0x4c76,10])
def snapshot():
 r=o.snapshot();return {k:r[k] for k in ('hp','max_hp','level','xp','slots','effects','state')}|dict(stats=list(o.read(0x4c70,6)),treasure_xp=o.dword(0x4c8e))
arrival={}
def arrived(o):
 arrival.clear();arrival.update(color=o.word(o.uc.reg_read(UC_X86_REG_BP)-4),before=snapshot())
o.intercept(0x2d4,0x17c,arrived)
seeds=[1,42,0x12345678,0xdeadbeef,0xffffffff]+[i*2654435761&0xffffffff for i in range(1,100)]
for seed in seeds:
 for cls in (0,1,2):
  for depth in (1,10,20):
   setup(seed,cls,depth);o.keys=[99];o.call(0x2d4,0xf);assert not o.keys
   fountains.append(dict(cls=cls,depth=depth,**arrival,after=snapshot()))
   setup(seed,cls,depth);o.call(0x139,0x2f8,[depth])
   hazards.append(dict(seed=seed,cls=cls,depth=depth,damage=100-o.snapshot()['hp'],state=o.dword(0xa530)))
 for dex,boots in [(3,0),(12,0),(18,0),(12,1),(12,4),(12,16)]:
  setup(seed,0,1);o.write(0x4c74,bytes([dex]));o.word(0x4c94,boots)
  o.block(0x343,0x76d,0x7ce,[(-0x12,0x4c50)])
  pits.append(dict(seed=seed,dex=dex,boots=boots,avoided=bool(o.uc.reg_read(UC_X86_REG_EFLAGS)&1),state=o.dword(0xa530)))
djinns=[]
for seed in seeds:
 for depth in (1,10,20):
  setup(seed,0,depth)
  o.write(0x4d5c,bytes(21*529*2))
  for z in range(1,depth+1):
   for y in range(1,21):
    for x in range(1,21):
     if (x+y+z)%3!=0 or (x,y,z)==(5,5,depth):o.word(0x4d5c+2*(z*529+y*23+x),0xf0)
  o.call(0x139,5)
  djinns.append(dict(seed=seed,depth=depth,position=list(o.read(0x4c8a,3)),state=o.dword(0xa530)))
path=ROOT/'tests/fixtures/dos-rooms.json';path.write_text(json.dumps(dict(provenance=dict(exe_sha256=hashlib.sha256((ROOT/'reference/dos/DND.EXE').read_bytes()).hexdigest(),method=__doc__),fountains=fountains,hazards=hazards,pits=pits,djinns=djinns),separators=(',',':'))+'\n')
print(len(fountains),'fountains,',len(hazards),'hazards,',len(pits),'pit checks,',len(djinns),'djinn relocations')
