#!/usr/bin/env python3
import json,hashlib
from pathlib import Path
from spell_oracle import SpellOracle
ROOT=Path(__file__).resolve().parents[2]
seeds=[1,42,0x12345678,0xdeadbeef,0xffffffff,987654321]
o=SpellOracle();cases=[]
for cls in (1,2):
 for tier in range(1,5):
  for number in range(1,5 if cls==1 else 7):
   if cls==2 and (tier,number) in [(3,3),(4,1)]:continue
   for seed in seeds:
    for kind,enemy_level,stats,held in [(0,10,[18]*6,0),(7,10,[12]*6,0),(8,5,[18]*6,3),(12,20,[18]*6,0),(13,5,[9,18,6,12,13,15],0),(14,20,[12,6,18,12,13,15],0)]:
     args=dict(seed=seed,cls=cls,level=10,kind=kind,enemy_level=enemy_level,stats=stats,held=held)
     o.setup(**args)
     expected=o.cast(cls,tier,number)
     cases.append(dict(input=dict(args,tier=tier,number=number),expected=expected))
path=ROOT/'tests/fixtures/dos-spells.json';path.write_text(json.dumps(dict(provenance={'exe_sha256':hashlib.sha256((ROOT/'reference/dos/DND.EXE').read_bytes()).hexdigest(),'method':'Full spell entry points; keyboard, output and delays substituted. Arithmetic, slot spending, monster damage, XP, level-up, room state execute in the original binary.'},cases=cases),separators=(',',':'))+'\n');print(len(cases),'complete casts captured')
