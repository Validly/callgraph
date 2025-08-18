export interface Node {
  id: string;
  name: string;
  type: string; // 'file', 'class', 'function', 'method', etc.
  metadata?: Record<string, any>; // extensible metadata
  children?: Map<string, Node>; // child nodes for hierarchical structure
  parent?: string; // parent node ID
}

export interface EdgeType {
  [key: string]: number; // e.g., { function_call: 3, instantiation: 1 }
}

export interface Edge {
  from: string; // node ID
  to: string; // node ID
  type: EdgeType | string; // either aggregated counts or single type
  sendsData?: boolean; // true if the call has parameters
  returnsData?: boolean; // true if the return value is used in an expression
}

export interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
}

export interface GraphOperations {
  dedupe(graph: Graph): Graph;
  collapse(graph: Graph, targetNodeId?: string): Graph;
}

// Legacy interfaces for backward compatibility during migration
export interface CallGraphNode {
  id: string;
  name: string;
  type: 'function' | 'method' | 'class';
  file: string;
  className?: string;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  type: 'call' | 'instantiation';
  sendsData?: boolean; // true if the call has parameters
  returnsData?: boolean; // true if the return value is used in an expression
}

export interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallGraphEdge[];
  files: Map<string, string[]>;
  classes: Map<string, string[]>;
}