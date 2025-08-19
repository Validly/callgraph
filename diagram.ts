import type { CallGraph } from './types.js';

function sanitizeId(id: string): string {
  if (!id) {
    console.warn('⚠️ Empty or null ID found in diagram generation, generating fallback ID');
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class DiagramGenerator {
  generateDot(callGraph: CallGraph): string {
    let dot = 'digraph CallGraph {\n';
    dot += '  compound=true;\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=rounded];\n';
    dot += '  edge [color=blue];\n\n';

    // Generate file clusters
    for (const [fileName, nodeIds] of callGraph.files) {
      dot += `  subgraph "cluster_${sanitizeId(fileName)}" {\n`;
      dot += `    label="${fileName}";\n`;
      dot += '    style=dashed;\n';
      dot += '    color=gray;\n';
      

      // Generate class clusters within files
      const fileClasses = new Set<string>();
      for (const nodeId of nodeIds) {
        const node = callGraph.nodes.get(nodeId);
        if (node?.className) {
          fileClasses.add(node.className);
        }
      }

      for (const className of fileClasses) {
        // Look for class nodes both by className alone and by file::className format
        let classNodeIds = callGraph.classes.get(className) || [];
        if (classNodeIds.length === 0) {
          classNodeIds = callGraph.classes.get(`${fileName}::${className}`) || [];
        }
        // Also try with underscores (for hybrid clustering)
        if (classNodeIds.length === 0) {
          const sanitizedClassName = className.replace(/\s+/g, '_');
          classNodeIds = callGraph.classes.get(`${fileName}::${sanitizedClassName}`) || [];
        }
        
        if (classNodeIds.length > 0) {
          dot += `    subgraph "cluster_${sanitizeId(fileName)}_${sanitizeId(className)}" {\n`;
          dot += `      label="${className}";\n`;
          dot += '      style=solid;\n';
          dot += '      color=lightblue;\n';
          
          for (const nodeId of classNodeIds) {
            const node = callGraph.nodes.get(nodeId);
            if (node) {
              // Extract original class from nodeId for better labeling (format: file__Class__method)
              let label = node.name;
              const nodeIdParts = nodeId.split('__');
              if (nodeIdParts.length >= 3) {
                const originalClass = nodeIdParts[1];
                // Always show class context for methods to distinguish between nodes with same method name
                if (originalClass && originalClass !== 'undefined') {
                  label = `${originalClass}::${node.name}`;
                }
              }
              dot += `      "${sanitizeId(nodeId)}" [label="${label}", shape=ellipse];\n`;
            }
          }
          dot += '    }\n';
        }
      }

      // Generate standalone functions in the file
      for (const nodeId of nodeIds) {
        const node = callGraph.nodes.get(nodeId);
        if (node && !node.className && node.type !== 'class') {
          // Extract class context from nodeId for standalone functions too
          let label = node.name;
          const nodeIdParts = nodeId.split('__');
          if (nodeIdParts.length >= 3) {
            const originalClass = nodeIdParts[1];
            if (originalClass && originalClass !== 'undefined') {
              label = `${originalClass}::${node.name}`;
            }
          }
          dot += `    "${sanitizeId(nodeId)}" [label="${label}", shape=ellipse];\n`;
        } else if (node && node.type === 'class') {
          dot += `    "${sanitizeId(nodeId)}" [label="${node.name}", shape=box, style="filled,rounded", fillcolor=lightcyan];\n`;
        }
      }

      dot += '  }\n\n';
    }

    // Generate edges with counts for duplicates
    const edgeMap = new Map<string, { 
      count: number; 
      type: 'call' | 'instantiation'; 
      sendsData: boolean; 
      returnsData: boolean; 
    }>();
    
    for (const edge of callGraph.edges) {
      const edgeKey = `${edge.from} -> ${edge.to} [${edge.type}]`;
      const existing = edgeMap.get(edgeKey);
      
      if (existing) {
        existing.count++;
        // Preserve data flow properties - if any edge sends/returns data, the combined edge should too
        existing.sendsData = existing.sendsData || !!edge.sendsData;
        existing.returnsData = existing.returnsData || !!edge.returnsData;
      } else {
        edgeMap.set(edgeKey, { 
          count: 1, 
          type: edge.type, 
          sendsData: !!edge.sendsData,
          returnsData: !!edge.returnsData
        });
      }
    }
    
    for (const [edgeKey, edgeInfo] of edgeMap) {
      const arrowMatch = edgeKey.match(/^(.+?) -> (.+?) \[(.+?)\]$/);
      if (!arrowMatch || !arrowMatch[1] || !arrowMatch[2] || !arrowMatch[3]) continue;
      
      const from = arrowMatch[1];
      const to = arrowMatch[2];
      const edgeType = arrowMatch[3] as 'call' | 'instantiation';
      const attributes: string[] = [];
      
      // Handle data flow arrow heads
      if (edgeInfo.sendsData && edgeInfo.returnsData) {
        // Bidirectional data flow - both arrow heads
        attributes.push('dir=both');
        attributes.push('arrowhead=normal');
        attributes.push('arrowtail=normal');
      } else if (edgeInfo.sendsData) {
        // Only sends data - forward arrow (default)
        attributes.push('arrowhead=normal');
      } else if (edgeInfo.returnsData) {
        // Only returns data - reverse arrow
        attributes.push('dir=back');
        attributes.push('arrowtail=normal');
      } else {
        // No data flow - simple connection line
        attributes.push('arrowhead=none');
      }
      
      // Add lhead for instantiation edges (Graphviz compound graph feature)
      if (edgeType === 'instantiation') {
        const toNode = callGraph.nodes.get(to);
        if (toNode?.className) {
          const clusterName = `cluster_${sanitizeId(toNode.file)}_${sanitizeId(toNode.className)}`;
          attributes.push(`lhead=${clusterName}`);
        }
      }
      
      if (edgeInfo.count > 1) {
        attributes.push(`label="×${edgeInfo.count}"`);
      }
      
      const attributeStr = attributes.length > 0 ? ` [${attributes.join(', ')}]` : '';
      dot += `  "${sanitizeId(from)}" -> "${sanitizeId(to)}"${attributeStr};\n`;
    }

    dot += '}\n';
    return dot;
  }

  generateSvg(callGraph: CallGraph): string {
    // For now, return the DOT content with instructions
    const dot = this.generateDot(callGraph);
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