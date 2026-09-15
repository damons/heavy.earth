#!/usr/bin/env python3
from inspect_exe import *
seg=int(sys.argv[1],16);off=int(sys.argv[2],16) if len(sys.argv)>2 else 0
size=int(sys.argv[3],16) if len(sys.argv)>3 else 0x2000
items=list(md.disasm(body[seg*16+off:seg*16+off+size],off));i=0
while i<len(items):
 ins=items[i]
 if ins.mnemonic=='mov' and ins.op_str=='ax, 0x46c0':
  end=i+1
  while end<len(items) and not(items[end].mnemonic=='lcall' and (items[end].op_str.startswith('0x12e0,') or items[end].op_str.startswith('0x1318,') or items[end].op_str.startswith('0x13aa,'))):end+=1
  strings=[]
  for k in range(i,min(end,len(items))):
   a=items[k]
   if a.mnemonic=='mov' and a.op_str.startswith('ax, 0x'):
    v=int(a.op_str.split('0x')[1],16)
    if v>=0xb260 and 0x13280+v<len(body):
     txt=body[0x13280+v:0x13280+v+100].split(b'\0')[0]
     if len(txt)>3 and all(32<=c<127 for c in txt[:4]):strings.append(repr(txt[:90]))
  print(f'{seg:04x}:{ins.address:04x}  OUTPUT '+', '.join(strings));i=end+1;continue
 print(f'{seg:04x}:{ins.address:04x}  {ins.mnemonic:8} {ins.op_str}')
 i+=1
