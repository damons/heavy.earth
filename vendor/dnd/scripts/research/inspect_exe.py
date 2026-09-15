#!/usr/bin/env python3
"""Read-only MZ inspection. Requires capstone (in the research virtualenv)."""
from pathlib import Path
import struct, collections, sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_16
ROOT=Path(__file__).resolve().parents[2]
EXE=ROOT/'reference/dos/DND-unpacked.EXE'
raw=EXE.read_bytes()
h=struct.unpack_from('<14H',raw)
body=raw[h[4]*16:]
relocs=[struct.unpack_from('<HH',raw,h[12]+i*4) for i in range(h[3])]
segments=collections.Counter(struct.unpack_from('<H',body,s*16+o)[0] for o,s in relocs)
md=Cs(CS_ARCH_X86,CS_MODE_16)
md.skipdata=True

def dis(seg,off=0,size=256):
 for ins in md.disasm(body[seg*16+off:seg*16+off+size],off):
  print(f'{seg:04x}:{ins.address:04x}  {ins.bytes.hex():20} {ins.mnemonic:8} {ins.op_str}')
if __name__=='__main__':
 if len(sys.argv)>1: dis(int(sys.argv[1],16),int(sys.argv[2],16) if len(sys.argv)>2 else 0,int(sys.argv[3],16) if len(sys.argv)>3 else 256)
 else:
  print('header',h);print('segment targets',[(hex(s),n) for s,n in segments.most_common()]);dis(h[11],h[10])
