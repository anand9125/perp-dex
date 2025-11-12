use std::ops::Mul;

use anchor_lang::prelude::Pubkey;
use bytemuck ::{Pod,Zeroable};

use crate::{FREE_NODE, INNER_NODE, INVALID_INDEX, LAST_FREE_NODE, LEAF_NODE, NODE_SIZE, SLAB_HEADER_LEN};
use crate::PerpError;

#[derive(Copy,Clone,Pod,Zeroable)]
#[repr(C)]
pub struct  SlabHeader {
    pub leaf_count : u64,
    pub bump_index : u64,
    pub free_list_head : u64,
    pub root : u64
}

impl SlabHeader{
    pub fn new ()->Self{
        Self { 
            leaf_count : 0,
            bump_index : 0,
            free_list_head : INVALID_INDEX as u64,
            root  : INVALID_INDEX as u64
         }
    }
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.leaf_count == 0
    }
}


#[derive(Copy,Clone,Pod,Zeroable)]
#[repr(C)]
pub struct InnerNode {
    pub tag : u32,
    pub padding : u32,    //Just for alignment,
    pub prefix_len : u64, //crit-bit-index it tells at which position two orderId diverger
    pub key : u128,      //Reference key used to store the prefix for comparison
    pub children : [u32;2],//left right  child indices
    pub _reserverd :[u64;5]  //Reserved space for future fields,lso keeps node size fixed (80 bytes total) and aligned
}

impl InnerNode {
    pub fn new (prefix_len :u64,key:u128)->Self{
        Self { 
            tag : INNER_NODE,
            padding : 0,
            prefix_len,
            key,
            children:[INVALID_INDEX,INVALID_INDEX],
            _reserverd:[0;5]
         }
    }
    #[inline]
    pub fn left(&self)->u32{
        self.children[0]
    }
    #[inline]
    pub fn right(&self)->u32 {
        self.children[1]
    }
    #[inline]
    pub fn set_left(&mut self,child:u32){
        self.children[0] = child;
    }
    #[inline]
    pub fn set_right(&mut self,child:u32){
        self.children[1] = child;
    }
}


#[derive(Copy, Clone, Pod, Zeroable)]
#[repr(C)]
pub struct LeafNode {
    pub tag: u32,
    
    pub owner_slot: u8,
    
    pub fee_tier: u8,
    
    pub padding: [u8; 2],
    
    pub key: u128,
    
    
    pub owner: [u8; 32],
    
    pub quantity: u64,
    
    pub client_order_id: u64,
    
    pub timestamp: i64,
}

impl LeafNode {
    pub fn new(
        owner_slot: u8,
        key: u128,
        owner: [u8; 32],
        quantity: u64,
        fee_tier: u8,
        client_order_id: u64,
        timestamp: i64,
    ) -> Self {
        Self {
            tag: LEAF_NODE,
            owner_slot,
            fee_tier,
            padding: [0; 2],
            key,
            owner,
            quantity,
            client_order_id,
            timestamp,
        }
    }

    /// Extract price from order ID (high 64 bits)
    #[inline]
    pub fn price(&self) -> u64 {
        (self.key >> 64) as u64
    }

    /// Extract sequence number from order ID (low 64 bits)
    #[inline]
    pub fn sequence_number(&self) -> u64 {
        self.key as u64
    }

    /// Create order key from price and sequence
    #[inline]
    pub fn price_key(price: u64, sequence: u64) -> u128 {
        ((price as u128) << 64) | (sequence as u128)
    }
}

#[derive(Copy,Clone,Pod,Zeroable)]
#[repr(C)]
pub struct FreeNode {
    pub tag : u32,
    pub padding : u32,
    pub next :u64,
    pub _reserved : [u64;9]
}
impl FreeNode{
    pub fn new(next:u64)->Self{
        Self {
            tag : FREE_NODE,
            padding:0,
            next ,
            _reserved :[0;9]
        }
    }
}

#[derive(Copy, Clone)]
#[repr(C)]
pub union NodeUnion {
    pub inner: InnerNode,
    pub leaf: LeafNode,
    pub free: FreeNode,
    pub tag: u32,
}

unsafe impl Pod for NodeUnion {}
unsafe impl Zeroable for NodeUnion {}

#[derive(Copy,Clone,Pod,Zeroable)]
#[repr(C)]
pub struct  AnyNode{
    pub node : NodeUnion
}


impl AnyNode {
    #[inline]
    pub fn tag(&self) -> u32 {
        unsafe { self.node.tag }
    }

    #[inline]
    pub fn as_inner(&self) -> &InnerNode {
        assert_eq!(self.tag(), INNER_NODE);
        unsafe { &self.node.inner }
    }

    #[inline]
    pub fn as_inner_mut(&mut self) -> &mut InnerNode {
        assert_eq!(self.tag(), INNER_NODE);
        unsafe { &mut self.node.inner }
    }

    #[inline]
    pub fn as_leaf(&self) -> &LeafNode {
        assert_eq!(self.tag(), LEAF_NODE);
        unsafe { &self.node.leaf }
    }

    #[inline]
    pub fn as_leaf_mut(&mut self) -> &mut LeafNode {
        assert_eq!(self.tag(), LEAF_NODE);
        unsafe { &mut self.node.leaf }
    }

    #[inline]
    pub fn as_free(&self) -> &FreeNode {
        assert!(self.tag() == FREE_NODE || self.tag() == LAST_FREE_NODE);
        unsafe { &self.node.free }
    }

    #[inline]
    pub fn as_free_mut(&mut self) -> &mut FreeNode {
        assert!(self.tag() == FREE_NODE || self.tag() == LAST_FREE_NODE);
        unsafe { &mut self.node.free }
    }
}


#[repr(C)]

pub struct Slab {
    pub header : SlabHeader,
    pub nodes : [AnyNode]
}

impl  Slab {
    pub const fn compute_allocation_size(capacity : usize)->usize {
        SLAB_HEADER_LEN + capacity*NODE_SIZE
    } 
    pub fn initializ(bytes: &mut[u8],capacity:usize)->Result<&mut Self,PerpError>{
        if bytes.len() < Self::compute_allocation_size(capacity){
            return  Err(PerpError::InsufficientSpace);
        }
        bytes.fill(0);

        let slab = Self::from_bytes_mut(bytes)?;

        slab.header = SlabHeader::new();

        for i in 0..capacity{
            let next = if i+1 <capacity{
                (i+1) as u64
            }else {
                INVALID_INDEX as u64
            };
            let tag = if i +1 < capacity{
                FREE_NODE
            }else {
                LAST_FREE_NODE
            };
            slab.nodes[i].node.free = FreeNode { 
                tag,
                padding :0,
                next,
                _reserved :[0;9]
             };
        }
        slab.header.free_list_head = if capacity>0 {
            0
        }else { 
            INVALID_INDEX as u64
        };
      Ok(slab)
    
    }
    pub fn from_bytes_mut(bytes: &mut[u8])->Result<&mut Self,PerpError>{

        let(header_bytes,node_bytes) = bytes.split_at_mut(SLAB_HEADER_LEN);
        let header = bytemuck::from_bytes_mut::<SlabHeader>(header_bytes);
        
        let node_count = node_bytes.len();
        
        let nodes_slice = unsafe {
            std::slice::from_raw_parts_mut(
                node_bytes.as_mut_ptr(),
                node_count
            )
        };
        Ok(unsafe {
            &mut *(std::ptr::slice_from_raw_parts_mut(
                header as *mut SlabHeader,
                nodes_slice.len(),
            ) as *mut Slab)
        })
    }
    #[inline]
    pub fn capacity(&self) -> usize {
        self.nodes.len()
    }
     
    //Allocate a node from free list
   fn allocate_node(&mut self) -> Result<u32, PerpError> {
        // Try free list first
        if self.header.free_list_head != INVALID_INDEX as u64 {
            let index = self.header.free_list_head as u32;
            let next = unsafe { self.nodes[index as usize].node.free.next };
            self.header.free_list_head = next;
            return Ok(index);
        }

        // Fall back to bump allocation
        if (self.header.bump_index as usize) < self.capacity() {
            let index = self.header.bump_index as u32;
            self.header.bump_index += 1;
            return Ok(index);
        }

        Err(PerpError::SlabFull)
    }

   //free a node back to the free list
    fn free_node(&mut self,index:u32){
        let node = &mut self.nodes[index as usize];
        node.node.free = FreeNode { 
            tag : FREE_NODE,
            padding : 0,
            next : self.header.free_list_head,
            _reserved :[0;9]
        };
        self.header.free_list_head = index as u64;
    }
    
}
        