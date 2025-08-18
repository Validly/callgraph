import { Graph, Edge, EdgeType, GraphOperations } from './types.js';

export class GraphOperationsImpl implements GraphOperations {
  
  dedupe(graph: Graph): Graph {
    const deduped = new Map<string, Edge>();
    
    for (const edge of graph.edges) {
      const key = `${edge.from}->${edge.to}`;
      
      if (deduped.has(key)) {
        const existing = deduped.get(key)!;
        
        // Merge data flow properties - if any edge sends/returns data, the combined edge should too
        existing.sendsData = existing.sendsData || edge.sendsData;
        existing.returnsData = existing.returnsData || edge.returnsData;
        
        // Merge edge types
        if (typeof existing.type === 'string' && typeof edge.type === 'string') {
          // Both are single types, convert to aggregated
          const aggregated: EdgeType = {};
          aggregated[existing.type] = 1;
          if (edge.type === existing.type) {
            aggregated[existing.type] = 2;
          } else {
            aggregated[edge.type] = 1;
          }
          existing.type = aggregated;
        } else if (typeof existing.type === 'object' && typeof edge.type === 'string') {
          // Existing is aggregated, edge is single
          const aggregated = existing.type as EdgeType;
          aggregated[edge.type] = (aggregated[edge.type] || 0) + 1;
        } else if (typeof existing.type === 'string' && typeof edge.type === 'object') {
          // Existing is single, edge is aggregated
          const aggregated = { ...edge.type as EdgeType };
          aggregated[existing.type] = (aggregated[existing.type] || 0) + 1;
          existing.type = aggregated;
        } else if (typeof existing.type === 'object' && typeof edge.type === 'object') {
          // Both are aggregated
          const existingAgg = existing.type as EdgeType;
          const edgeAgg = edge.type as EdgeType;
          for (const [type, count] of Object.entries(edgeAgg)) {
            existingAgg[type] = (existingAgg[type] || 0) + count;
          }
        }
      } else {
        deduped.set(key, { ...edge });
      }
    }
    
    return {
      nodes: new Map(graph.nodes),
      edges: Array.from(deduped.values())
    };
  }
  
  collapse(graph: Graph, targetNodeId?: string): Graph {
    const collapsedNodes = new Map(graph.nodes);
    const collapsedEdges: Edge[] = [];
    
    // Determine which nodes to collapse
    const nodesToCollapse = targetNodeId 
      ? [targetNodeId]
      : Array.from(graph.nodes.values())
          .filter(node => !node.parent) // top-level nodes only
          .map(node => node.id);
    
    // For each node to collapse, remove its children and redirect edges
    for (const nodeId of nodesToCollapse) {
      const node = graph.nodes.get(nodeId);
      if (!node || !node.children) continue;
      
      // Remove all child nodes
      const childIds = Array.from(node.children.keys());
      for (const childId of childIds) {
        this.removeNodeAndDescendants(collapsedNodes, childId);
      }
      
      // Clear children from the parent node
      node.children = undefined;
    }
    
    // Redirect edges that were pointing to/from collapsed nodes
    for (const edge of graph.edges) {
      let newFrom = edge.from;
      let newTo = edge.to;
      
      // Find the appropriate parent for source node
      const fromNode = graph.nodes.get(edge.from);
      if (fromNode && !collapsedNodes.has(edge.from)) {
        newFrom = this.findCollapsedParent(graph.nodes, edge.from, nodesToCollapse);
      }
      
      // Find the appropriate parent for target node
      const toNode = graph.nodes.get(edge.to);
      if (toNode && !collapsedNodes.has(edge.to)) {
        newTo = this.findCollapsedParent(graph.nodes, edge.to, nodesToCollapse);
      }
      
      // Only add edge if both endpoints still exist and are different
      if (newFrom && newTo && newFrom !== newTo && 
          collapsedNodes.has(newFrom) && collapsedNodes.has(newTo)) {
        collapsedEdges.push({
          from: newFrom,
          to: newTo,
          type: edge.type,
          sendsData: edge.sendsData,
          returnsData: edge.returnsData
        });
      }
    }
    
    return {
      nodes: collapsedNodes,
      edges: collapsedEdges
    };
  }
  
  private removeNodeAndDescendants(nodes: Map<string, any>, nodeId: string): void {
    const node = nodes.get(nodeId);
    if (!node) return;
    
    // Recursively remove children first
    if (node.children) {
      for (const childId of node.children.keys()) {
        this.removeNodeAndDescendants(nodes, childId);
      }
    }
    
    // Remove this node
    nodes.delete(nodeId);
  }
  
  private findCollapsedParent(nodes: Map<string, any>, nodeId: string, collapsedNodes: string[]): string | null {
    const node = nodes.get(nodeId);
    if (!node) return null;
    
    // If this node is one of the collapsed nodes, return it
    if (collapsedNodes.includes(nodeId)) {
      return nodeId;
    }
    
    // Otherwise, look for parent
    if (node.parent) {
      return this.findCollapsedParent(nodes, node.parent, collapsedNodes);
    }
    
    // If no parent and not in collapsed list, this node should remain
    return nodeId;
  }
  
  // Convenience method to get high-level view
  getHighLevelGraph(graph: Graph): Graph {
    return this.dedupe(this.collapse(graph));
  }
}

export const graphOps = new GraphOperationsImpl();