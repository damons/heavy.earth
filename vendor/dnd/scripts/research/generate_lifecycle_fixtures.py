#!/usr/bin/env python3
"""Capture original exploration ticks, reincarnation and movement spells.
State transitions execute in the original image; file writes, output, delays
and keyboard are intercepted. No host filesystem is exposed to the guest.
"""
import json, hashlib, struct
from pathlib import Path
from spell_oracle import SpellOracle
from inspect_exe import body,md
ROOT=Path(__file__).resolve().parents[2]
o=SpellOracle()
# Reincarnation's additional text-output entry points.
for ins in md.disasm(body[0x1390:0x1390+0xd40],0):
 if ins.mnemonic=='lcall':
  seg,off=[int(x,16) for x in ins.op_str.split(', ')]
  if seg in (0x12e0,0x1318,0x13aa):
   ret=next(i for i in md.disasm(body[seg*16+off:seg*16+off+2000],off) if i.mnemonic=='retf')
   n=int(ret.op_str or '0',0);o.intercept(seg,off,lambda o,n=n:o.ret(n))
o.intercept(0x217,0x44d,lambda o:o.ret())
# Terminal death ends the state block before deletion/UI.
o.intercept(0x139,0x9a6,lambda o:o.jump(0xcdf))
def w(off):return struct.unpack('<h',o.read(0x4c50+off,2))[0]
def snapshot():
 return dict(stats=list(o.read(0x4c70,6)),level=w(0x28),xp=o.dword(0x4c7a),hp=w(0x30),max_hp=w(0x2e),slots=[w(0x56+i*2) for i in range(4)],effects=[w(0x5e+i*2) for i in range(11)],equipment=[w(0x42+i*2) for i in range(6)],gold=o.dword(0x4c82),bank=o.dword(0x4c86),treasure_xp=o.dword(0x4c8e),immortal=bool(o.read(0x4cc4,1)[0]),orb=bool(o.read(0x4ccc,1)[0]),flags=o.word(0x4cce),recovery=w(0x7a),position=list(o.read(0x4c8a,3)),state=o.dword(0xa530))
def setup(seed,cls,level=10):
 o.setup(seed,cls,level=level)
 # Derive capacities through the original routine, then fill current slots.
 for i in range(4):o.word(0x4c9e+i*2,0);o.word(0x4ca6+i*2,0)
 o.call(0xf9f,0x85d,[0x4c76,level])
seeds=[1,42,0x12345678,0xdeadbeef,0xffffffff,987654321]
teleports=[];reincarnations=[];ticks=[];passwalls=[]
for seed in seeds:
 for depth in (1,5,10,20):
  setup(seed,2);o.write(0x4c8c,bytes([depth]));before=snapshot()
  out=o.cast(2,4,1,False)
  teleports.append(dict(before=before,after=snapshot(),finished=out['finished']))
 for cls in (0,1,2):
  for level in (1,2,9,20):
   for con in (1,2,18):
    setup(seed,cls,level);o.write(0x4c73,bytes([con]));o.word(0x4c80,0)
    o.write(0x4cc4,b'\x01');o.write(0x4ccc,b'\x01');o.word(0x4cce,1)
    o.dword(0x4c82,1234);o.dword(0x4c86,5678);o.dword(0x4c8e,4321)
    for i in range(6):o.word(0x4c92+i*2,i+1)
    for i in range(11):o.word(0x4cae+i*2,i+1)
    before=snapshot();o.block(0x139,0x982,0xcdf,[(-0x10,0x4c50)])
    reincarnations.append(dict(cls=cls,before=before,after=snapshot()))
  for ring in (0,2):
   for continual in (False,True):
    setup(seed,cls);o.word(0x4c96,ring);o.word(0x4cca,2);o.word(0x4cce,int(continual))
    for i in range(4):o.word(0x4ca6+i*2,max(0,w(0x4e+i*2)-2))
    for i in range(11):o.word(0x4cae+i*2,i+1)
    before=snapshot();steps=[]
    for _ in range(160):
     o.block(0x139,0x42e,0x508);steps.append(snapshot())
    ticks.append(dict(cls=cls,before=before,steps=steps))
# Capture complete Pass Wall casts, including blocked/outside destinations.
for combat in (False,True):
 for direction,dx,dy in [('W',0,-1),('D',1,0),('X',0,1),('A',-1,0)]:
  for blocked in (False,True):
   setup(42,2)
   # DOS in-memory map is a 23x23 padded grid per level, y stride 23.
   x,y,z=5,5,1
   index=z*529+(y+dy)*23+x+dx
   o.word(0x4d5c+index*2,0xf0 if blocked else 0)
   before=snapshot();o.keys=[ord('3'),ord('3'),ord(direction)]
   result=o.call(0x7c9,0x3f4,[int(combat)])
   assert not o.keys
   passwalls.append(dict(direction=direction,blocked=blocked,combat=combat,before=before,after=snapshot(),finished=bool(result&1)))
path=ROOT/'tests/fixtures/dos-lifecycle.json'
path.write_text(json.dumps(dict(provenance=dict(exe_sha256=hashlib.sha256((ROOT/'reference/dos/DND.EXE').read_bytes()).hexdigest(),method=__doc__),teleports=teleports,reincarnations=reincarnations,ticks=ticks,passwalls=passwalls),separators=(',',':'))+'\n')
print(len(teleports),'teleports,',len(reincarnations),'reincarnations,',len(ticks)*160,'sequential ticks,',len(passwalls),'pass-wall casts')
