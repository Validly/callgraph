import type { Graph, Node, Edge, EdgeType } from './types.js';

function sanitizeId(id: string): string {
  if (!id) {
    console.warn('⚠️ Empty or null ID found in graph diagram generation, generating fallback ID');
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class GraphDiagramGenerator {
  generateDot(graph: Graph): string {
    let dot = 'digraph CallGraph {\n';
    dot += '  compound=true;\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=rounded];\n';
    dot += '  edge [color=blue];\n\n';

    // Generate clusters recursively
    for (const [nodeId, node] of graph.nodes) {
      if (!node.parent) { // Top-level nodes only
        dot = this.generateNodeCluster(dot, node, graph);
      }
    }

    // Generate edges with rendering-level deduplication
    const edgeMap = new Map<string, Edge>();
    
    for (const edge of graph.edges) {
      const key = `${edge.from}->${edge.to}`;
      
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        
        // Merge data flow properties
        existing.sendsData = existing.sendsData || edge.sendsData;
        existing.returnsData = existing.returnsData || edge.returnsData;
        
        // Merge edge types (same logic as in dedupe operations)
        if (typeof existing.type === 'string' && typeof edge.type === 'string') {
          if (existing.type === edge.type) {
            // Same type - convert to aggregated to track count
            existing.type = { [existing.type]: 2 };
          } else {
            // Different types - create aggregated object
            existing.type = { [existing.type]: 1, [edge.type]: 1 };
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
      } else {
        edgeMap.set(key, { ...edge });
      }
    }
    
    // Generate DOT for deduplicated edges
    for (const edge of edgeMap.values()) {
      dot = this.generateEdge(dot, edge, graph);
    }

    dot += '}\n';
    return dot;
  }

  private generateNodeCluster(dot: string, node: Node, graph: Graph, depth: number = 0): string {
    const indent = '  '.repeat(depth + 1);
    const hasChildren = node.children && node.children.size > 0;
    
    if (hasChildren) {
      // Generate as cluster if node has children
      dot += `${indent}subgraph "cluster_${sanitizeId(node.id)}" {\n`;
      dot += `${indent}  label="${node.name}";\n`;
      
      // Style based on node type
      switch (node.type) {
        case 'file':
          dot += `${indent}  style=dashed;\n`;
          dot += `${indent}  color=gray;\n`;
          break;
        case 'class':
          dot += `${indent}  style=solid;\n`;
          dot += `${indent}  color=lightblue;\n`;
          break;
        default:
          dot += `${indent}  style=dotted;\n`;
          dot += `${indent}  color=black;\n`;
      }

      // Generate child nodes
      for (const [childId, childNode] of node.children!) {
        dot = this.generateNodeCluster(dot, childNode, graph, depth + 1);
      }

      dot += `${indent}}\n\n`;
    } else {
      // Generate as regular node if no children
      const shape = this.getNodeShape(node.type);
      const style = this.getNodeStyle(node.type);
      dot += `${indent}"${sanitizeId(node.id)}" [label="${node.name}", shape=${shape}${style}];\n`;
    }

    return dot;
  }

  private generateEdge(dot: string, edge: Edge, graph: Graph): string {
    const attributes: string[] = [];
    
    // Simple forward arrow for all function calls
    attributes.push('arrowhead=normal');
    
    // Handle edge types
    if (typeof edge.type === 'string') {
      // Simple edge type
      if (edge.type === 'instantiation') {
        attributes.push('style=dashed');
      }
    } else {
      // Aggregated edge types
      const edgeType = edge.type as EdgeType;
      const totalCount = Object.values(edgeType).reduce((sum, count) => sum + count, 0);
      
      if (totalCount > 1) {
        const typeLabels = Object.entries(edgeType)
          .map(([type, count]) => count > 1 ? `x${count}` : type)
          .join(', ');
        attributes.push(`label="${typeLabels}"`);
      }
      
      // Use dashed style if any instantiation
      if (edgeType.instantiation && edgeType.instantiation > 0) {
        attributes.push('style=dashed');
      }
    }

    const attributeStr = attributes.length > 0 ? ` [${attributes.join(', ')}]` : '';
    dot += `  "${sanitizeId(edge.from)}" -> "${sanitizeId(edge.to)}"${attributeStr};\n`;
    
    return dot;
  }

  private getNodeShape(nodeType: string): string {
    switch (nodeType) {
      case 'class':
        return 'box';
      case 'function':
      case 'method':
        return 'ellipse';
      case 'file':
        return 'folder';
      default:
        return 'box';
    }
  }

  private getNodeStyle(nodeType: string): string {
    switch (nodeType) {
      case 'class':
        return ', style="filled,rounded", fillcolor=lightcyan';
      case 'function':
        return '';
      case 'method':
        return ', fillcolor=lightyellow';
      case 'file':
        return ', style=filled, fillcolor=lightgray';
      default:
        return '';
    }
  }

  generateSvg(graph: Graph): string {
    const dot = this.generateDot(graph);
    return `<!-- 
To generate SVG from this DOT file:
1. Install Graphviz: apt-get install graphviz (or brew install graphviz on macOS)
2. Run: dot -Tsvg input.dot -o output.svg

DOT Content:
-->

${dot}`;
  }

  saveToFile(content: string, outputPath: string): void {
    const fs = require('fs');
    fs.writeFileSync(outputPath, content, 'utf8');
  }
}