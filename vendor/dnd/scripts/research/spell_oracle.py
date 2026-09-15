#!/usr/bin/env python3
"""Run complete original spell entry points with a supplied keyboard queue.
Only text output, colors and delays are stubbed. Numerical/state routines execute.
"""
from oracle import Oracle,UC_X86_REG_SP
from inspect_exe import body,md
import struct
class SpellOracle(Oracle):
 def __init__(self):
  super().__init__();self.keys=[]
  targets=set()
  for seg,start,size in [(0x7c9,0,0x1b40),(0x60d,0,0x1360),(0xf9f,0,0x1610),(0x97c,0,0x1e4)]:
   for i in md.disasm(body[seg*16+start:seg*16+start+size],start):
    if i.mnemonic=='lcall':
     s,o=[int(x,16) for x in i.op_str.split(', ')]
     if s in [0x12e0,0x1318,0x13aa]:targets.add((s,o))
  for s,o in targets:
   returns=[i for i in md.disasm(body[s*16+o:s*16+o+2000],o) if i.mnemonic=='retf']
   assert returns,(s,o)
   n=int(returns[0].op_str or '0',0)
   self.intercept(s,o,lambda o,n=n:o.ret(n))
  for s,o,n in [(0xf95,0x46,0),(0xf95,0x62,2),(0xf95,0x83,0),(0x20d,3,2),(0x20d,0x60,0),(0xf9f,0x1394,4)]:self.intercept(s,o,lambda o,n=n:o.ret(n))
  def key(o):
   if not self.keys:raise RuntimeError('Unexpected keyboard request')
   o.ret(ax=self.keys.pop(0))
  self.intercept(0xf9f,0x3cb,key)
 def setup(self,seed,cls,level=10,kind=0,enemy_level=10,stats=(18,18,18,18,18,18),hp=100,enemy_hp=80,held=0):
  self.write(0x4c50,bytes(128));self.write(0x4d50,bytes(12));self.dword(0xa530,seed)
  self.write(0x4c70,bytes(stats));self.write(0x4c76,bytes([cls]));self.word(0x4c78,level)
  self.call(0xf9f,0x773,[0x4c7a,cls,level])
  self.word(0x4c7e,200);self.word(0x4c80,hp)
  self.write(0x4c8a,bytes([5,5,1,0]));self.dword(0xa52a,0)
  for i in range(4):self.word(0x4c9e+i*2,20);self.word(0x4ca6+i*2,20)
  dies=[2,3,4,5,6,6,7,8,8,10,10,12,14,16,20]
  self.write(0x4d50,bytes([kind+1,enemy_level,dies[kind],4,3,0]));self.word(0x4d56,enemy_hp);self.word(0x4d58,enemy_hp);self.word(0x4d5a,held)
  self.word(0x4d5c+649*2,0xf000)
 def snapshot(self):
  def w(off):return struct.unpack('<h',self.read(off,2))[0]
  return dict(hp=w(0x4c80),max_hp=w(0x4c7e),level=w(0x4c78),xp=self.dword(0x4c7a),slots=[w(0x4ca6+i*2) for i in range(4)],effects=[w(0x4cae+i*2) for i in range(11)],flags=self.word(0x4cce),monster_hp=w(0x4d58),held=w(0x4d5a),state=self.dword(0xa530),room=self.word(0x4d5c+649*2))
 def cast(self,cls,tier,number,combat=True):
  self.keys=[ord(str(tier)),ord(str(number))]
  result=self.call(0x60d if cls==1 else 0x7c9,0x10c if cls==1 else 0x3f4,[int(combat)])
  assert not self.keys
  return dict(self.snapshot(),finished=bool(result&1))
if __name__=='__main__':
 for cls in (1,2):
  for number in range(1,5 if cls==1 else 7):
   if cls==2 and number==1:continue
   o=SpellOracle();o.setup(0x12345678,cls)
   print(cls,4,number,o.cast(cls,4,number))
