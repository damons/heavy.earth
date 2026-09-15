#!/usr/bin/env python3
"""Original initialization and file writer with synthetic user-entered characters.
Only file runtime calls are intercepted. No real account/player data is used.
"""
from pathlib import Path
from oracle import Oracle,UC_X86_REG_SI
ROOT=Path(__file__).resolve().parents[2]
o=Oracle();records=[]
for cls,name,seed in [(0,'DOS Fighter',42),(2,'DOS Mage',123)]:
 o.call(0xf9f,0xc72,[0x4c50]);o.dword(0xa530,seed);o.block(0xe0,0xe6,0x12e)
 o.uc.reg_write(UC_X86_REG_SI,0x4c50)
 o.block(0xe0,0x1df,0x212,[(-6,cls),(-0x92,0x4c50)])
 o.write(0x4c50,name.encode().ljust(16,b'\0'));o.write(0x4c60,b'fixture-secret\0\0')
 if cls==2:
  o.write(0x4c47,b'\x05');o.write(0x4c46,b'\x0f')
  o.block(0x55b,0x42e,0x4de,[(-4,0x4c50)])
  o.write(0x4c8d,b'\x04');o.word(0x4c80,6);o.dword(0x4c82,1234);o.dword(0x4c86,56789)
  for i in range(6):o.word(0x4c92+2*i,i+1)
  o.word(0x4ca6,1);o.word(0x4cae,100);o.word(0x4cce,1);o.write(0x4cc4,b'\x01');o.write(0x4ccc,b'\x01')
 records.append(o.read(0x4c50,128))
for i,record in enumerate(records):
 addr=0x3000+0x100*i;o.word(addr,addr+0x100 if i+1<len(records) else 0);o.write(addr+2,record)
o.word(0xa52e,0x3000);written=[]
o.intercept(0x11fa,0x988,lambda o:o.ret(2))
def write(o):written.append(o.read(0x4bb6,128));o.ret(2)
o.intercept(0x11fa,0x85f,write);o.call(0x217,0x161)
assert written[:-1]==records and written[-1][:16]==b' '*16
path=ROOT/'tests/fixtures/PLAYERS.DAT';path.write_bytes(b''.join(written));print(f'Captured {len(written)} records from original writer')
