#!/usr/bin/env python3
"""Execute isolated original 16-bit DOS routines with Unicorn; no DOS filesystem.
Only the MZ image and explicitly supplied state are available to the guest.
"""
from inspect_exe import body, relocs
import struct
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE, UC_HOOK_INTR
from unicorn.x86_const import *
BASE=0x1000
DS=BASE+0x1328
class Oracle:
 def __init__(self):
  self.uc=Uc(UC_ARCH_X86,UC_MODE_16);self.uc.mem_map(0,0x100000)
  data=bytearray(body)
  for o,s in relocs:
   p=s*16+o;struct.pack_into('<H',data,p,(struct.unpack_from('<H',data,p)[0]+BASE)&65535)
  self.uc.mem_write(BASE*16,bytes(data))
  self.uc.reg_write(UC_X86_REG_DS,DS);self.uc.reg_write(UC_X86_REG_ES,DS);self.uc.reg_write(UC_X86_REG_SS,DS)
  self.uc.hook_add(UC_HOOK_INTR,lambda uc,n,u: (_ for _ in ()).throw(RuntimeError(f'unexpected DOS interrupt {n:02x}')))
  self.hooks={}
  self.uc.hook_add(UC_HOOK_CODE,self._hook)
 def _hook(self,uc,address,size,user):
  if address in self.hooks:self.hooks[address](self)
 def read(self,off,size):return bytes(self.uc.mem_read(DS*16+off,size))
 def write(self,off,data):self.uc.mem_write(DS*16+off,data)
 def word(self,off,value=None):
  if value is None:return struct.unpack('<H',self.read(off,2))[0]
  self.write(off,struct.pack('<H',value&65535))
 def dword(self,off,value=None):
  if value is None:return struct.unpack('<I',self.read(off,4))[0]
  self.write(off,struct.pack('<I',value&0xffffffff))
 def ret(self,n=0,ax=None):
  sp=self.uc.reg_read(UC_X86_REG_SP);ip,cs=struct.unpack('<HH',self.read(sp,4))
  self.uc.reg_write(UC_X86_REG_SP,sp+4+n);self.uc.reg_write(UC_X86_REG_CS,cs);self.uc.reg_write(UC_X86_REG_IP,ip)
  if ax is not None:self.uc.reg_write(UC_X86_REG_AX,ax&65535)
 def intercept(self,seg,off,fn):self.hooks[(BASE+seg)*16+off]=fn
 def jump(self,off):self.uc.reg_write(UC_X86_REG_IP,off)
 def block(self,seg,start,end,locals=()):
  """Run an unmodified instruction range with an explicitly prepared stack frame."""
  self.uc.reg_write(UC_X86_REG_BP,0x3f00);self.uc.reg_write(UC_X86_REG_SP,0x3d00)
  for offset,value in locals:self.word(0x3f00+offset,value)
  self.uc.reg_write(UC_X86_REG_CS,BASE+seg);self.uc.reg_write(UC_X86_REG_IP,start)
  self.uc.emu_start((BASE+seg)*16+start,(BASE+seg)*16+end,count=200000)
  if self.uc.reg_read(UC_X86_REG_IP)!=end:raise RuntimeError('Block did not reach endpoint')
 def call(self,seg,off,args=(),count=200000):
  # Pascal pushes args left-to-right, then far return address.
  sp=0x4000
  for a in args:sp-=2;self.word(sp,a)
  sp-=4;self.write(sp,struct.pack('<HH',0,0x9000))
  self.uc.reg_write(UC_X86_REG_SP,sp);self.uc.reg_write(UC_X86_REG_BP,0)
  self.uc.reg_write(UC_X86_REG_CS,BASE+seg);self.uc.reg_write(UC_X86_REG_IP,off)
  self.uc.emu_start((BASE+seg)*16+off,0x90000,count=count)
  if self.uc.reg_read(UC_X86_REG_CS)!=0x9000:raise RuntimeError(f'Routine did not return: {self.uc.reg_read(UC_X86_REG_CS)-BASE:04x}:{self.uc.reg_read(UC_X86_REG_IP):04x}')
  return self.uc.reg_read(UC_X86_REG_AX)
if __name__=='__main__':
 o=Oracle();o.dword(0xa530,0x12345678)
 print('integer stream')
 for _ in range(8):print(o.call(0x116d,0x46,[0xa530]),hex(o.dword(0xa530)))
 o.dword(0xa530,0x12345678)
 print('float stream')
 for _ in range(4):
  o.call(0x116d,0,[0xa530,0x3000]);print(o.read(0x3000,4).hex(),struct.unpack('<f',o.read(0x3000,4))[0],hex(o.dword(0xa530)))
 o.dword(0xa530,0x12345678)
 print('3d6:',[o.call(0xf9f,0x106,[3,6]) for _ in range(12)])
