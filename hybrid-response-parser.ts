import type { Graph, Node, Edge } from './types.js';

export interface HybridCluster {
  id: string;
  name: string;
  description: string;
  domain: string;
  pattern?: string;
  nodes: string[];
  responsibilities?: string[];
  dependencies?: string[];
  cohesion?: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface HybridClusteringResponse {
  clusters: HybridCluster[];
  architecture?: {
    style: string;
    layers: string[];
    patterns: string[];
  };
  reasoning: string;
}

export class HybridResponseParser {
  parseClusteringResponse(response: string): HybridClusteringResponse {
    try {
      const cleanedResponse = this.extractJSONFromResponse(response);
      const parsed = JSON.parse(cleanedResponse);

      if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
        throw new Error('Invalid response: missing or invalid clusters array');
      }

      return parsed as HybridClusteringResponse;
    } catch (error) {
      throw new Error(`Failed to parse hybrid clustering response: ${error.message}`);
    }
  }

  applyClusteringToGraph(graph: Graph, clusteringResponse: HybridClusteringResponse): Graph {
    // Create a new Graph with single-level clustering
    const hybridGraph: Graph = {
      nodes: new Map(),
      edges: [...graph.edges]
    };
    
    for (const cluster of clusteringResponse.clusters) {
      // Create cluster node directly as top-level node
      const clusterId = cluster.name.replace(/\s+/g, '_');
      const clusterNode: Node = {
        id: clusterId,
        name: cluster.name,
        type: 'file', // Use 'file' type for top-level clustering
        metadata: { 
          isCluster: true, 
          domain: cluster.domain, 
          cluster: cluster.name,
          description: cluster.description,
          responsibilities: cluster.responsibilities 
        },
        children: new Map()
      };
      
      hybridGraph.nodes.set(clusterId, clusterNode);

      // Move function nodes into the cluster
      for (const nodeId of cluster.nodes) {
        const originalNode = graph.nodes.get(nodeId);
        if (originalNode && (originalNode.type === 'function' || originalNode.type === 'method')) {
          // Update the node to belong to the cluster
          const updatedNode: Node = {
            ...originalNode,
            parent: clusterId,
            metadata: {
              ...originalNode.metadata,
              domain: cluster.domain,
              cluster: cluster.name
            }
          };
          
          hybridGraph.nodes.set(nodeId, updatedNode);
          clusterNode.children!.set(nodeId, updatedNode);
        }
      }
    }

    // Handle any nodes that weren't assigned to clusters
    let uncategorizedClusterNode: Node | null = null;
    
    for (const [nodeId, node] of graph.nodes) {
      if (!hybridGraph.nodes.has(nodeId) && (node.type === 'function' || node.type === 'method')) {
        // Create uncategorized cluster if needed
        if (!uncategorizedClusterNode) {
          const uncategorizedClusterId = 'Uncategorized';
          uncategorizedClusterNode = {
            id: uncategorizedClusterId,
            name: 'Uncategorized',
            type: 'file',
            metadata: { isCluster: true, domain: 'Uncategorized', cluster: 'Uncategorized' },
            children: new Map()
          };
          hybridGraph.nodes.set(uncategorizedClusterId, uncategorizedClusterNode);
        }
        
        // Move node to uncategorized cluster
        const updatedNode: Node = {
          ...node,
          parent: uncategorizedClusterNode!.id,
          metadata: {
            ...node.metadata,
            domain: 'Uncategorized',
            cluster: 'Uncategorized'
          }
        };
        
        hybridGraph.nodes.set(nodeId, updatedNode);
        uncategorizedClusterNode!.children!.set(nodeId, updatedNode);
      }
    }

    return hybridGraph;
  }

  // Backward compatibility method - delegates to new Graph-based method
  formatCallGraphForLLM(callGraph: any): { nodes: string; edges: string } {
    return this.formatGraphForLLM(callGraph);
  }

  // Backward compatibility method - delegates to new Graph-based method  
  applyClusteringToCallGraph(callGraph: any, clusteringResponse: HybridClusteringResponse): any {
    return this.applyClusteringToGraph(callGraph, clusteringResponse);
  }

  private extractJSONFromResponse(response: string): string {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    return jsonMatch[0];
  }

  validateClusteringResponse(response: HybridClusteringResponse): string[] {
    const errors: string[] = [];

    if (!response.clusters || response.clusters.length === 0) {
      errors.push('No clusters found in response');
    } else {
      const clusterIds = new Set<string>();
      const allNodeIds = new Set<string>();

      for (const cluster of response.clusters) {
        // Check required fields
        if (!cluster.id || !cluster.name || !cluster.description || !cluster.domain) {
          errors.push(`Invalid cluster: missing required fields (id: ${cluster.id}, name: ${cluster.name})`);
        }

        // Check for duplicate cluster IDs
        if (clusterIds.has(cluster.id)) {
          errors.push(`Duplicate cluster ID: ${cluster.id}`);
        }
        clusterIds.add(cluster.id);

        // Check for nodes
        if (!cluster.nodes || cluster.nodes.length === 0) {
          errors.push(`Cluster '${cluster.id}' has no nodes assigned`);
        } else {
          // Check for duplicate node assignments
          for (const nodeId of cluster.nodes) {
            if (allNodeIds.has(nodeId)) {
              errors.push(`Node '${nodeId}' is assigned to multiple clusters`);
            }
            allNodeIds.add(nodeId);
          }
        }

        // Validate dependencies if provided
        if (cluster.dependencies) {
          for (const depId of cluster.dependencies) {
            if (!clusterIds.has(depId)) {
              errors.push(`Cluster '${cluster.id}' depends on unknown cluster: ${depId}`);
            }
          }
        }
      }
    }

    if (!response.reasoning || response.reasoning.trim().length === 0) {
      errors.push('Missing overall reasoning for clustering approach');
    }

    return errors;
  }

  formatGraphForLLM(graph: Graph): { nodes: string; edges: string } {
    const nodesList: string[] = [];
    const edgesList: string[] = [];

    // Format nodes
    for (const [id, node] of graph.nodes) {
      const location = node.metadata?.className ? `${node.metadata.file}::${node.metadata.className}` : node.metadata?.file || 'unknown';
      nodesList.push(`- ${id} [${node.type}] "${node.name}" in ${location}`);
    }

    // Format edges
    for (const edge of graph.edges) {
      const dataInfo = [];
      if (edge.sendsData) dataInfo.push('sends data');
      if (edge.returnsData) dataInfo.push('returns data');
      const dataStr = dataInfo.length > 0 ? ` (${dataInfo.join(', ')})` : '';
      
      const edgeType = typeof edge.type === 'string' ? edge.type : Object.keys(edge.type).join('|');
      edgesList.push(`- ${edge.from} --(${edgeType})--> ${edge.to}${dataStr}`);
    }

    return {
      nodes: nodesList.join('\n'),
      edges: edgesList.join('\n')
    };
  }

  generateClusteringSummary(response: HybridClusteringResponse): string {
    let summary = `Domain-Based Clustering Analysis\n`;
    summary += `=====================================\n\n`;

    if (response.architecture) {
      summary += `Architecture Style: ${response.architecture.style}\n`;
      if (response.architecture.layers.length > 0) {
        summary += `Layers: ${response.architecture.layers.join(', ')}\n`;
      }
      if (response.architecture.patterns.length > 0) {
        summary += `Patterns: ${response.architecture.patterns.join(', ')}\n`;
      }
      summary += `\n`;
    }

    summary += `Found ${response.clusters.length} domain clusters:\n\n`;

    for (const cluster of response.clusters) {
      summary += `🏷️  **${cluster.name}** (${cluster.id})\n`;
      summary += `   Domain: ${cluster.domain}\n`;
      summary += `   Description: ${cluster.description}\n`;
      summary += `   Nodes: ${cluster.nodes.length} functions/methods\n`;
      
      if (cluster.cohesion) {
        summary += `   Cohesion: ${cluster.cohesion}\n`;
      }
      
      if (cluster.dependencies && cluster.dependencies.length > 0) {
        summary += `   Dependencies: ${cluster.dependencies.join(', ')}\n`;
      }
      
      if (cluster.responsibilities && cluster.responsibilities.length > 0) {
        summary += `   Responsibilities: ${cluster.responsibilities.join(', ')}\n`;
      }
      
      summary += `   Reasoning: ${cluster.reasoning}\n\n`;
    }

    summary += `Overall Reasoning:\n${response.reasoning}\n`;

    return summary;
  }
}