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
  
  // Convenience method to get high-level view with selective cluster collapsing and depth control
  getSelectiveHighLevelGraph(graph: Graph, clusterSpecs: string[]): Graph {
    if (clusterSpecs.length === 0) {
      // Default behavior: collapse all top-level clusters
      return this.getHighLevelGraph(graph);
    }
    
    // Parse cluster specifications with depth control
    const clusterConfig = new Map<string, number>(); // cluster name -> max depth (0 = collapsed)
    let defaultDepth = 0; // 0 means collapsed
    let collapseAll = false;
    
    for (const spec of clusterSpecs) {
      if (spec === 'all') {
        collapseAll = true;
        defaultDepth = 0;
      } else if (spec.startsWith('all:')) {
        collapseAll = true;
        defaultDepth = parseInt(spec.split(':')[1]) || 0;
      } else if (spec.startsWith('-')) {
        // Exclusion with optional depth: -cluster or -cluster:depth
        const excludeSpec = spec.substring(1);
        const parts = excludeSpec.split(':');
        const clusterName = parts[0];
        const depth = parts.length > 1 ? parseInt(parts[1]) || Infinity : Infinity;
        clusterConfig.set(clusterName, depth);
      } else {
        // Inclusion with optional depth: cluster or cluster:depth
        const parts = spec.split(':');
        const clusterName = parts[0];
        const depth = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
        clusterConfig.set(clusterName, depth);
      }
    }
    
    // Get all top-level cluster names
    const allTopLevelClusters = Array.from(graph.nodes.values())
      .filter(node => !node.parent)
      .map(node => node.metadata?.cluster || node.name || node.id);
    
    // Determine final depth configuration for each cluster
    const finalClusterConfig = new Map<string, number>();
    
    if (collapseAll) {
      // Start with default depth for all clusters
      for (const clusterName of allTopLevelClusters) {
        finalClusterConfig.set(clusterName, defaultDepth);
      }
      
      // Override with specific configurations
      for (const [clusterName, depth] of clusterConfig.entries()) {
        if (allTopLevelClusters.includes(clusterName)) {
          finalClusterConfig.set(clusterName, depth);
        }
      }
    } else {
      // Only specified clusters are processed, rest are fully expanded
      for (const clusterName of allTopLevelClusters) {
        const configuredDepth = clusterConfig.get(clusterName);
        finalClusterConfig.set(clusterName, configuredDepth !== undefined ? configuredDepth : Infinity);
      }
    }
    
    const configSummary = Array.from(finalClusterConfig.entries())
      .map(([name, depth]) => `${name}:${depth === Infinity ? 'full' : depth}`)
      .join(', ');
    console.log(`🔍 Depth-controlled expansion: ${configSummary}`);
    
    // Apply depth-controlled expansion
    return this.getDepthControlledGraph(graph, finalClusterConfig);
  }
  private getDepthControlledGraph(graph: Graph, clusterConfig: Map<string, number>): Graph {
    const resultGraph: Graph = {
      nodes: new Map(),
      edges: []
    };
    
    // Process each top-level cluster with its configured depth
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) { // Top-level nodes only
        const clusterName = node.metadata?.cluster || node.name || node.id;
        const maxDepth = clusterConfig.get(clusterName) || 0;
        
        if (maxDepth === 0) {
          // Completely collapsed - add only the top-level node
          resultGraph.nodes.set(nodeId, {
            ...node,
            children: undefined
          });
        } else {
          // Depth-controlled expansion
          this.copyNodeWithDepthLimit(graph, resultGraph, nodeId, maxDepth, 0);
        }
      }
    }
    
    // Process edges with mapping for collapsed/depth-limited nodes
    const nodeMapping = this.createDepthControlledNodeMapping(graph, clusterConfig);
    
    for (const edge of graph.edges) {
      const mappedFrom = nodeMapping.get(edge.from) || edge.from;
      const mappedTo = nodeMapping.get(edge.to) || edge.to;
      
      // Only add edge if both endpoints exist in result graph and are different
      if (mappedFrom !== mappedTo && 
          resultGraph.nodes.has(mappedFrom) && 
          resultGraph.nodes.has(mappedTo)) {
        resultGraph.edges.push({
          from: mappedFrom,
          to: mappedTo,
          type: edge.type,
          sendsData: edge.sendsData,
          returnsData: edge.returnsData
        });
      }
    }
    
    // Deduplicate edges
    return this.dedupe(resultGraph);
  }
  
  private copyNodeWithDepthLimit(sourceGraph: Graph, targetGraph: Graph, nodeId: string, maxDepth: number, currentDepth: number): void {
    const node = sourceGraph.nodes.get(nodeId);
    if (!node) return;
    
    // Copy the node
    const copiedNode = { ...node };
    
    if (currentDepth >= maxDepth || !node.children || node.children.size === 0) {
      // At max depth or no children - stop expanding
      copiedNode.children = undefined;
    } else {
      // Continue expanding children
      copiedNode.children = new Map();
      for (const childId of node.children.keys()) {
        this.copyNodeWithDepthLimit(sourceGraph, targetGraph, childId, maxDepth, currentDepth + 1);
        copiedNode.children.set(childId, targetGraph.nodes.get(childId)!);
      }
    }
    
    targetGraph.nodes.set(nodeId, copiedNode);
  }
  
  private createDepthControlledNodeMapping(graph: Graph, clusterConfig: Map<string, number>): Map<string, string> {
    const mapping = new Map<string, string>();
    
    // For each top-level cluster, map nodes beyond the depth limit to their appropriate parent
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) { // Top-level node
        const clusterName = node.metadata?.cluster || node.name || node.id;
        const maxDepth = clusterConfig.get(clusterName) || 0;
        
        if (maxDepth === 0) {
          // Completely collapsed - map all descendants to the cluster root
          this.mapDescendantsToRoot(graph, mapping, nodeId, nodeId);
        } else {
          // Depth-limited - map nodes beyond maxDepth to their depth-limit ancestor
          this.mapNodesByDepthLimit(graph, mapping, nodeId, maxDepth, 0, nodeId);
        }
      }
    }
    
    return mapping;
  }
  
  private mapNodesByDepthLimit(graph: Graph, mapping: Map<string, string>, currentNodeId: string, maxDepth: number, currentDepth: number, rootId: string): void {
    const node = graph.nodes.get(currentNodeId);
    if (!node) return;
    
    if (currentDepth > maxDepth) {
      // Beyond max depth - find the ancestor at maxDepth
      const ancestorAtLimit = this.findAncestorAtDepth(graph, currentNodeId, maxDepth, rootId);
      mapping.set(currentNodeId, ancestorAtLimit || rootId);
    } else {
      // Within depth limit - map to self
      mapping.set(currentNodeId, currentNodeId);
    }
    
    // Process children
    if (node.children) {
      for (const childId of node.children.keys()) {
        this.mapNodesByDepthLimit(graph, mapping, childId, maxDepth, currentDepth + 1, rootId);
      }
    }
  }
  
  private findAncestorAtDepth(graph: Graph, nodeId: string, targetDepth: number, rootId: string): string | null {
    // Walk up the parent chain to find the node at the target depth
    let current = nodeId;
    let depth = this.calculateNodeDepth(graph, nodeId, rootId);
    
    while (depth > targetDepth && current !== rootId) {
      const node = graph.nodes.get(current);
      if (!node?.parent) break;
      current = node.parent;
      depth--;
    }
    
    return current;
  }
  
  private calculateNodeDepth(graph: Graph, nodeId: string, rootId: string): number {
    let depth = 0;
    let current = nodeId;
    
    while (current !== rootId) {
      const node = graph.nodes.get(current);
      if (!node?.parent) break;
      current = node.parent;
      depth++;
    }
    
    return depth;
  }

  private getSelectiveCollapsedGraph(graph: Graph, clustersToCollapse: Set<string>): Graph {
    const resultGraph: Graph = {
      nodes: new Map(),
      edges: []
    };
    
    // Process each top-level node
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) { // Top-level nodes only
        const clusterName = node.metadata?.cluster || node.name || node.id;
        
        if (clustersToCollapse.has(clusterName)) {
          // Collapse this cluster - add only the top-level node without children
          resultGraph.nodes.set(nodeId, {
            ...node,
            children: undefined
          });
        } else {
          // Keep this cluster expanded - add node and all descendants
          this.copyNodeAndDescendants(graph, resultGraph, nodeId);
        }
      }
    }
    
    // Process edges with mapping for collapsed nodes
    const nodeMapping = this.createNodeMapping(graph, clustersToCollapse);
    
    for (const edge of graph.edges) {
      const mappedFrom = nodeMapping.get(edge.from) || edge.from;
      const mappedTo = nodeMapping.get(edge.to) || edge.to;
      
      // Only add edge if both endpoints exist in result graph and are different
      if (mappedFrom !== mappedTo && 
          resultGraph.nodes.has(mappedFrom) && 
          resultGraph.nodes.has(mappedTo)) {
        resultGraph.edges.push({
          from: mappedFrom,
          to: mappedTo,
          type: edge.type,
          sendsData: edge.sendsData,
          returnsData: edge.returnsData
        });
      }
    }
    
    // Deduplicate edges
    return this.dedupe(resultGraph);
  }
  
  private copyNodeAndDescendants(sourceGraph: Graph, targetGraph: Graph, nodeId: string): void {
    const node = sourceGraph.nodes.get(nodeId);
    if (!node) return;
    
    // Copy the node
    targetGraph.nodes.set(nodeId, { ...node });
    
    // Recursively copy children
    if (node.children) {
      for (const childId of node.children.keys()) {
        this.copyNodeAndDescendants(sourceGraph, targetGraph, childId);
      }
    }
  }
  
  private createNodeMapping(graph: Graph, clustersToCollapse: Set<string>): Map<string, string> {
    const mapping = new Map<string, string>();
    
    // For each collapsed cluster, map all descendants to the cluster root
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) { // Top-level node
        const clusterName = node.metadata?.cluster || node.name || node.id;
        
        if (clustersToCollapse.has(clusterName)) {
          // Map all descendants of this cluster to the cluster root
          this.mapDescendantsToRoot(graph, mapping, nodeId, nodeId);
        }
      }
    }
    
    return mapping;
  }
  
  private mapDescendantsToRoot(graph: Graph, mapping: Map<string, string>, currentNodeId: string, rootId: string): void {
    mapping.set(currentNodeId, rootId);
    
    const node = graph.nodes.get(currentNodeId);
    if (node?.children) {
      for (const childId of node.children.keys()) {
        this.mapDescendantsToRoot(graph, mapping, childId, rootId);
      }
    }
  }

  // Convenience method to get high-level view  
  getHighLevelGraph(graph: Graph): Graph {
    // Get only top-level nodes (nodes with no parent)
    const topLevelNodes = new Map<string, any>();
    
    // Find all top-level nodes
    console.log(`🔍 Debug: Scanning ${graph.nodes.size} nodes for top-level nodes...`);
    let topLevelCount = 0;
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) {
        topLevelNodes.set(nodeId, {
          ...node,
          children: undefined // Remove children to make it truly high-level
        });
        topLevelCount++;
        if (topLevelCount <= 10) {
          console.log(`   Top-level node: ${nodeId} (type: ${node.type})`);
        }
      }
    }
    console.log(`📊 Debug: Found ${topLevelCount} top-level nodes`);
    console.log(`📊 Debug: Top-level node keys:`, Array.from(topLevelNodes.keys()).slice(0, 5));
    
    // Create a mapping from child nodes to their top-level parents
    const nodeToTopLevel = new Map<string, string>();
    
    function findTopLevelParent(nodeId: string): string {
      const node = graph.nodes.get(nodeId);
      if (!node) {
        return nodeId;
      }
      
      // Check if we've cached this lookup
      if (nodeToTopLevel.has(nodeId)) {
        return nodeToTopLevel.get(nodeId)!;
      }
      
      // If this node has no parent, it's the top-level
      if (!node.parent) {
        nodeToTopLevel.set(nodeId, nodeId);
        return nodeId;
      }
      
      // Recursively find the top-level parent
      const topLevel = findTopLevelParent(node.parent);
      nodeToTopLevel.set(nodeId, topLevel);
      return topLevel;
    }
    
    // Create edges between top-level nodes based on child relationships
    const edgeMap = new Map<string, Edge>();
    
    console.log(`🔍 Debug: Processing ${graph.edges.length} edges to find domain connections...`);
    let crossDomainEdges = 0;
    
    for (const edge of graph.edges) {
      const fromTopLevel = findTopLevelParent(edge.from);
      const toTopLevel = findTopLevelParent(edge.to);
      
      // Debug logging for a few sample edges and the node hierarchy
      if (crossDomainEdges < 3) {
        console.log(`   Edge: ${edge.from} → ${edge.to}`);
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        console.log(`   From node parent: ${fromNode?.parent}, To node parent: ${toNode?.parent}`);
        console.log(`   Top-level: ${fromTopLevel} → ${toTopLevel}`);
        console.log(`   Different domains: ${fromTopLevel !== toTopLevel}`);
        console.log(`   From exists: ${topLevelNodes.has(fromTopLevel)}, To exists: ${topLevelNodes.has(toTopLevel)}`);
        
        // Show the parent chain for debugging
        let current = edge.from;
        const chain = [current];
        while (graph.nodes.get(current)?.parent) {
          current = graph.nodes.get(current)!.parent!;
          chain.push(current);
        }
        console.log(`   Parent chain: ${chain.join(' → ')}`);
      }
      
      // Only create edge if different top-level nodes and both exist
      if (fromTopLevel !== toTopLevel && 
          topLevelNodes.has(fromTopLevel) && 
          topLevelNodes.has(toTopLevel)) {
        
        crossDomainEdges++;
        
        const edgeKey = `${fromTopLevel}->${toTopLevel}`;
        
        if (edgeMap.has(edgeKey)) {
          // Merge with existing edge (aggregate edge types)
          const existing = edgeMap.get(edgeKey)!;
          if (typeof existing.type === 'string' && typeof edge.type === 'string') {
            if (existing.type === edge.type) {
              // Same type, keep as string but we'll handle counts later in dedupe
              existing.type = edge.type;
            } else {
              // Different types, create aggregated object
              const aggregated: EdgeType = {};
              aggregated[existing.type] = 1;
              aggregated[edge.type] = 1;
              existing.type = aggregated;
            }
          } else if (typeof existing.type === 'object' && typeof edge.type === 'string') {
            const aggregated = existing.type as EdgeType;
            aggregated[edge.type] = (aggregated[edge.type] || 0) + 1;
          } else if (typeof existing.type === 'string' && typeof edge.type === 'object') {
            const aggregated = { ...edge.type as EdgeType };
            aggregated[existing.type] = (aggregated[existing.type] || 0) + 1;
            existing.type = aggregated;
          } else if (typeof existing.type === 'object' && typeof edge.type === 'object') {
            const existingAgg = existing.type as EdgeType;
            const edgeAgg = edge.type as EdgeType;
            for (const [type, count] of Object.entries(edgeAgg)) {
              existingAgg[type] = (existingAgg[type] || 0) + count;
            }
          }
          
          // Merge data flow properties
          existing.sendsData = existing.sendsData || edge.sendsData;
          existing.returnsData = existing.returnsData || edge.returnsData;
        } else {
          edgeMap.set(edgeKey, {
            from: fromTopLevel,
            to: toTopLevel,
            type: edge.type,
            sendsData: edge.sendsData,
            returnsData: edge.returnsData
          });
        }
      }
    }
    
    console.log(`✅ Debug: Found ${crossDomainEdges} cross-domain edges, created ${edgeMap.size} domain-to-domain connections`);
    
    return {
      nodes: topLevelNodes,
      edges: Array.from(edgeMap.values())
    };
  }
}

export const graphOps = new GraphOperationsImpl();