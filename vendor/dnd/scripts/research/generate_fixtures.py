#!/usr/bin/env python3
"""Capture original DOS calculations, never compute expected values in Python.
Requires the user's original, unpacked DND v1.2:1 executable and Unicorn.
"""
import hashlib,json,struct
from pathlib import Path
from oracle import Oracle
ROOT=Path(__file__).resolve().parents[2]
seeds=[1,42,0x12345678,0xdeadbeef,0xffffffff]
def setup(seed,cls=0,level=1,stats=(12,12,12,12,12,12),hp=12,max_hp=12):
 o=Oracle();o.write(0x4c50,bytes(128));o.dword(0xa530,seed)
 o.write(0x4c70,bytes(stats));o.write(0x4c76,bytes([cls]));o.word(0x4c78,level)
 o.word(0x4c7e,max_hp);o.word(0x4c80,hp);return o
out={'provenance':{'executable_sha256':hashlib.sha256((ROOT/'reference/dos/DND.EXE').read_bytes()).hexdigest(),'unpacked_sha256':hashlib.sha256((ROOT/'reference/dos/DND-unpacked.EXE').read_bytes()).hexdigest(),'generator':'scripts/research/generate_fixtures.py','method':'Original 16-bit instructions in Unicorn; fixed input memory; output-only branches skipped in attack slices.'},'rng':[],'dice':[],'characters':[],'experience':[],'slots':[],'monsters':[],'player_attacks':[],'monster_attacks':[],'level_up':[]}
for seed in seeds:
 o=setup(seed);ints=[o.call(0x116d,0x46,[0xa530]) for _ in range(32)];state=o.dword(0xa530)
 o=setup(seed);floats=[]
 for _ in range(32):o.call(0x116d,0,[0xa530,0x3000]);floats.append(o.dword(0x3000))
 out['rng'].append(dict(seed=seed,ints=ints,float_bits=floats,state=state))
 for n,sides in [(3,6),(2,8),(1,100),(1,0),(0,6)]:
  o=setup(seed);values=[o.call(0xf9f,0x106,[n,sides]) for _ in range(16)]
  out['dice'].append(dict(seed=seed,n=n,sides=sides,values=values,state=o.dword(0xa530)))
 o=setup(seed);o.block(0xe0,0xe6,0x12e)
 out['characters'].append(dict(seed=seed,stats=list(o.read(0x4c70,6)),state=o.dword(0xa530)))
 for cls in range(3):
  o=setup(seed,cls,stats=(18,12,12,9,12,12));o.dword(0x4c7a,100000)
  o.intercept(0xf95,0x62,lambda o:o.ret(2))
  # Stop after all changes, before announcement; run routine's entry prologue.
  o.block(0xf9f,0x9e7,0xaac,[(6,0),(8,0)])
  out['level_up'].append(dict(seed=seed,cls=cls,level=o.word(0x4c78),xp=o.dword(0x4c7a),max_hp=o.word(0x4c7e),hp=o.word(0x4c80),state=o.dword(0xa530)))
for cls in range(3):
 for level in range(1,31):
  o=setup(1,cls,level);o.call(0xf9f,0x773,[0x3000,cls,level])
  out['experience'].append(dict(cls=cls,level=level,xp=o.dword(0x3000)))
  o.call(0xf9f,0x85d,[0x4c76,level]);out['slots'].append(dict(cls=cls,level=level,slots=[o.word(0x4c9e+i*2) for i in range(4)]))
for kind in range(1,16):
 for seed in seeds:
  level=kind+2;o=setup(seed)
  o.block(0x97c,0x821,0x95e,[(-0x14,0x4d50),(8,kind),(6,level)])
  out['monsters'].append(dict(kind=kind-1,level=level,seed=seed,die=o.read(0x4d52,1)[0],strength=o.read(0x4d53,1)[0],armor=o.read(0x4d54,1)[0],hp=o.word(0x4d56),state=o.dword(0xa530)))
# Vary wounds, held status, odd hit die, equipment and effects independently.
for cls in range(3):
 for seed in seeds:
  for variant in range(8):
   stats=[3 if variant==0 else 18,12,12,12,9+variant,12]
   level=4;hp=3 if variant%2 else 20;held=2 if variant&2 else 0
   die=[2,3,4,5,6,7,8,20][variant];armor=variant%4
   o=setup(seed,cls,level,stats,hp,20)
   o.word(0x4c9c,2);o.word(0x4cb4,3 if variant&4 else 0);o.word(0x4cbc,3 if variant&4 else 0)
   o.write(0x4d50,bytes([1,5,die,3,armor,0]));o.word(0x4d5a,held)
   for start,end in [(0x39a,0x3b1),(0x3b9,0x3d0),(0x3d0,0x3e2),(0x3e2,0x3f9),(0x4c0,0x4d7),(0x4d7,0x4ee)]:o.intercept(0x97c,start,lambda o,e=end:o.jump(e))
   damage=[0];chance=[0]
   def capture(o):damage[0]=o.word(0x3efa);o.jump(0x4fb)
   o.intercept(0x97c,0x4f0,capture)
   o.intercept(0x97c,0x382,lambda o:chance.__setitem__(0,o.word(0x3efa)))
   o.block(0x97c,0x298,0x4fb,[(-0xe,0x4c50),(-0x10,0x4d50)])
   out['player_attacks'].append(dict(seed=seed,cls=cls,stats=stats,level=level,hp=hp,max_hp=20,weapon=2,prayer=bool(variant&4),strength=bool(variant&4),monster_level=5,die=die,armor=armor,held=held,chance=chance[0],damage=damage[0],state=o.dword(0xa530)))
   o=setup(seed,cls,level,stats,hp,20);o.word(0x4c98,variant%3);o.word(0x4c9a,2)
   for off in (0x60,0x62,0x64):o.word(0x4c50+off,3 if variant&4 else 0)
   o.write(0x4d50,bytes([1,5,die,3,armor,0]));o.word(0x4d56,20);o.word(0x4d58,hp)
   for start,end in [(0xbab,0xbc2),(0xbca,0xbe1),(0xbe1,0xbf3),(0xbf3,0xc0a),(0xc44,0xd3a),(0xc98,0xd3a),(0xcd1,0xd3a)]:o.intercept(0x97c,start,lambda o,e=end:o.jump(e))
   chance=[0];o.intercept(0x97c,0xb93,lambda o:chance.__setitem__(0,o.word(0x3efe)))
   o.block(0x97c,0xa81,0xd3a,[(-0x16,0x4c50),(-0x14,0x4d50)])
   out['monster_attacks'].append(dict(seed=seed,cls=cls,stats=stats,level=level,hp=hp,max_hp=20,shield=variant%3,armor=2,effects=bool(variant&4),monster_level=5,die=die,monster_strength=3,monster_armor=armor,monster_hp=hp,monster_max_hp=20,chance=chance[0] if chance[0]<32768 else chance[0]-65536,damage=hp-struct.unpack('<h',o.read(0x4c80,2))[0],state=o.dword(0xa530)))
out['durations']=[];out['resistance']=[];out['evasion']=[]
for seed in seeds:
 for level in (1,5,20):
  for old in (0,75,99):
   for seg,start,end in [(0x60d,0x14,0x58),(0x7c9,0x10,0x54)]:
    o=setup(seed,1,level);o.word(0x4cae,old);o.block(seg,start,end,[(6,0)])
    out['durations'].append(dict(seed=seed,level=level,old=old,duration=o.word(0x4cae),state=o.dword(0xa530)))
  for stat_a,stat_b,enemy in [(3,18,5),(12,13,5),(18,18,20),(12,12,1)]:
   for seg,start,end in [(0x60d,0x65,0xbe),(0x7c9,0x61,0xba)]:
    o=setup(seed,1,level,stats=(12,stat_a,12,12,12,stat_b));o.write(0x4d51,bytes([enemy]));o.block(seg,start,end,[(6,5),(8,1)])
    out['resistance'].append(dict(seed=seed,level=level,stat_a=stat_a,stat_b=stat_b,enemy=enemy,success=bool(o.word(0x3efe)&1),state=o.dword(0xa530)))
 for dex in (3,12,18):
  for boots in (0,1,5):
   o=setup(seed,stats=(12,12,12,12,dex,12));o.word(0x4c94,boots)
   o.block(0x97c,0x624,0x6b2,[(-0xe,0x4c50)])
   from oracle import UC_X86_REG_CX
   out['evasion'].append(dict(seed=seed,dex=dex,boots=boots,success=bool((o.word(0x3eea)|o.uc.reg_read(UC_X86_REG_CX))&1),state=o.dword(0xa530)))
path=ROOT/'tests/fixtures/dos-routines.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(out,indent=2)+'\n')
print({k:len(v) for k,v in out.items() if isinstance(v,list)})
