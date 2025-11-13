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
    #[inline]
    pub fn walk_down(&self,key:u128)->u32{
        let crit_bit_mask = 1u128 << self.prefix_len;
        let direction = ((key & crit_bit_mask)!= 0) as usize;
        self.children[direction]
    }
}




#[derive(Clone, Copy, Zeroable, Pod, Debug)]
#[repr(C)]
pub struct LeafNode {
    pub tag: u32,
    pub fee_tier: u8,
    pub reserved: [u8; 3],
    pub key: u128,
    pub owner: [u8; 32],
    pub quantity: u64,
    pub timestamp: i64,
}

impl LeafNode {
    pub fn new(
        key: u128,
        owner: [u8; 32],
        quantity: u64,
        fee_tier: u8,
        timestamp: i64,
    ) -> Self {
        Self {
            tag: LEAF_NODE,
            fee_tier,
            reserved: [0; 3],
            key,
            owner,
            quantity,
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
    pub fn insert_leaf (&mut self,leaf: &LeafNode)->Result<u32,PerpError>{
        if self.header.leaf_count >= self.capacity() as u64 {
            return  Err(PerpError::SlabFull);
        }
        let new_leaf_index = self.allocate_node()?;
        self.nodes[new_leaf_index as usize].node.leaf = *leaf;

        if self.header.root == INVALID_INDEX as u64{
            self.header.root = new_leaf_index as u64;
        }
        
        else {
           //walk through the right spot 
           let  mut parent_index = INVALID_INDEX;
           let  mut current_index = self.header.root as u32;
           loop {
            let current_node = &self.nodes[current_index as usize];
             
             match current_node.tag() {
                LEAF_NODE =>{
                    let existing_leaf = current_node.as_leaf();
                    let existing_key = existing_leaf.key;
                    let new_key = leaf.key;
                    let xor = existing_key^new_key; //this will find the first byte where the keys will differ
                    let prefix_len = xor.leading_zeros();
                    let inner_index = self.allocate_node()?;
                    let mut inner = InnerNode::new(prefix_len.into(), new_key);
                    self.nodes[inner_index as usize].node.inner = inner;

                    let crit_bit = (new_key>>(127-prefix_len)&1);
                    if crit_bit == 0 {
                        inner.set_left(new_leaf_index);
                        inner.set_right(current_index);
                    }else{
                        inner.set_left(current_index);
                        inner.set_right(new_leaf_index);
                    }
                    if parent_index ==INVALID_INDEX{
                        self.header.root = inner_index as u64;

                    }
                    else {
                        let parent = self.nodes[parent_index as usize].as_inner_mut();
                        if parent.left() == current_index{
                            parent.set_left(inner_index);
                        }
                        else {
                            parent.set_right(inner_index);
                        }
                    }
                    break;
                }
                INNER_NODE=>{
                    parent_index = current_index;
                    let inner = current_node.as_inner();
                    current_index = inner.walk_down(leaf.key);
                    
                    if current_index ==INVALID_INDEX{
                        return  Err(PerpError::InvalidTree);
                    }
                }
                _=>return  Err(PerpError::InvalidTree)
                 
             }
           }
        }
        self.header.leaf_count +=1;
        Ok(new_leaf_index)
    }
    pub fn remove_leaf (&mut self,leaf_index:u32)->Result<LeafNode,PerpError>{
        if self.nodes[leaf_index as usize].tag() != LEAF_NODE{
            return Err(PerpError::InvalidNodeType);
        }
        let removed_leaf = *self.nodes[leaf_index as usize].as_leaf();
        if self.header.root as u32 == leaf_index {
            self.header.root = INVALID_INDEX as u64;
            self.free_node(leaf_index);
            self.header.leaf_count -= 1;
            return Ok(removed_leaf);
        }
        let (parent_index,sibling_index) = self.find_parent_and_sibling(leaf_index)?;

        let grandparent_index = if self.header.root as u32 == parent_index{
            INVALID_INDEX
        }else {
            self.find_parent(parent_index)?
        };
        if grandparent_index == INVALID_INDEX {
           self.header.root = sibling_index as u64;
        }
        else {
            let grandparent = self.nodes[grandparent_index as usize].as_inner_mut();
            if  grandparent.left() == parent_index {
                grandparent.set_left(sibling_index);
            }else {
                grandparent.set_right(sibling_index);
            }
        }
        self.free_node(leaf_index);
        self.free_node(parent_index);
        self.header.leaf_count -= 1;

        Ok(removed_leaf)

    }
    pub fn find_max (&self)->Option<u32>{
      if self.header.root == INVALID_INDEX as u64 {
        return None;
      }
      let mut current = self.header.root as u32 ;
      loop {
        let node = &self.nodes[current as usize];
        match  node.tag() {
            LEAF_NODE => return Some(current),
            INNER_NODE => {
                let right = node.as_inner().right();
                if right == INVALID_INDEX{
                    return None;
                }
                current = right
            }
            _ =>return None
        }
      }
    }
    pub fn find_min(&self)->Option<u32>{
        if self.header.root == INVALID_INDEX as u64 {
            return  None;
        }
        let mut current  = self.header.root as u32;
        loop {
            let node = &self.nodes[current as usize];
            match node.tag() {
                LEAF_NODE => return  Some(current),
                INNER_NODE => {
                    let left = node.as_inner().left();
                    if left == INVALID_INDEX{
                        return None;
                    }
                    current = left;
                }
                _=> return  None,
            }
        }

    }
    pub fn find_by_key(&self, key: u128) -> Option<u32> {
        if self.header.root == INVALID_INDEX as u64 {
            return None;
        }

        let mut current = self.header.root as u32;
        loop {
            let node = &self.nodes[current as usize];
            match node.tag() {
                LEAF_NODE => {
                    let leaf = node.as_leaf();
                    return if leaf.key == key {
                        Some(current)
                    } else {
                        None
                    };
                }
                INNER_NODE => {
                    let inner = node.as_inner();
                    current = inner.walk_down(key);
                    if current == INVALID_INDEX {
                        return None;
                    }
                }
                _ => return None,
            }
        }
    }
    pub fn find_parent(&self,child_index:u32)->Result<u32,PerpError>{
        let (parent,__) = self.find_parent_and_sibling(child_index)?;
        Ok(parent)
    }
    pub fn find_parent_and_sibling (&self,child_index:u32)->Result<(u32,u32),PerpError>{
        if self.header.root as u32 == child_index{
            return  Err(PerpError::NodeIsRoot);
        }
        let mut current = self.header.root as u32;
        let child_key = match self.nodes[child_index as usize].tag(){
            LEAF_NODE => self.nodes[child_index as usize].as_leaf().key,
            _ => return Err(PerpError::InvalidNodeType),
        };
        loop {
            let node = &self.nodes[current as usize];
            if node.tag() != INNER_NODE{
                return Err(PerpError::InvalidTree);
            }
            let inner = node.as_inner();
            let left = inner.left();
            let right = inner.right();
            if left == child_index {
                return Ok((current,right));
            }
            if right == child_index{
                return Ok((current,left));
            }
            current = inner.walk_down(child_key);
            if current == INVALID_INDEX {
                return  Err((PerpError::NodeNotFound));
            }

        }
            
        

    }
}
        