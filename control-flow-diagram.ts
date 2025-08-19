import type { Graph, Node, Edge } from './types.js';

export class ControlFlowDiagramGenerator {
  generateDot(graph: Graph, functionName: string): string {
    let dot = 'digraph ControlFlow {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [fontname="Arial", fontsize=10];\n';
    dot += '  edge [fontname="Arial", fontsize=9];\n';
    dot += `  label="${functionName} Control Flow";\n`;
    dot += '  labelloc=t;\n\n';

    // Generate nodes with appropriate shapes and styles
    for (const [nodeId, node] of graph.nodes) {
      dot += this.generateNode(nodeId, node);
    }

    dot += '\n';

    // Generate edges with appropriate labels and styles
    for (const edge of graph.edges) {
      dot += this.generateEdge(edge);
    }

    dot += '}\n';
    return dot;
  }

  private generateNode(nodeId: string, node: Node): string {
    const sanitizedId = this.sanitizeId(nodeId);
    let shape = 'box';
    let style = 'rounded';
    let color = 'black';
    let fillColor = 'white';
    let label = this.escapeLabel(node.name);

    switch (node.type) {
      case 'start':
        shape = 'ellipse';
        fillColor = 'lightgreen';
        style = 'filled';
        break;
      case 'end':
        shape = 'ellipse';
        fillColor = 'lightcoral';
        style = 'filled';
        break;
      case 'condition':
        shape = 'diamond';
        fillColor = 'lightyellow';
        style = 'filled';
        break;
      case 'function_call':
        shape = 'box';
        fillColor = 'lightblue';
        style = 'filled,rounded';
        // For function calls, show them as rounded rectangles
        if (node.metadata?.calls) {
          const calls = node.metadata.calls as { name: string, external: boolean }[];
          if (calls.length === 1) {
            label = calls[0].name;
          }
        }
        break;
      case 'return':
        shape = 'box';
        fillColor = 'orange';
        style = 'filled,rounded';
        break;
      case 'throw':
        shape = 'box';
        fillColor = 'red';
        style = 'filled,rounded';
        color = 'white';
        break;
      case 'try':
        shape = 'box';
        fillColor = 'lightcyan';
        style = 'filled,rounded';
        break;
      case 'catch':
        shape = 'box';
        fillColor = 'lightpink';
        style = 'filled,rounded';
        break;
      case 'finally':
        shape = 'box';
        fillColor = 'lavender';
        style = 'filled,rounded';
        break;
      case 'loop':
        shape = 'box';
        fillColor = 'lightgray';
        style = 'filled,rounded';
        break;
      case 'switch':
        shape = 'hexagon';
        fillColor = 'lightyellow';
        style = 'filled';
        break;
      case 'case':
        shape = 'box';
        fillColor = 'wheat';
        style = 'filled,rounded';
        break;
      case 'statement':
      default:
        shape = 'box';
        fillColor = 'white';
        style = 'rounded';
        break;
    }

    return `  ${sanitizedId} [shape=${shape}, style="${style}", fillcolor="${fillColor}", color="${color}", label="${label}"];\n`;
  }

  private generateEdge(edge: Edge): string {
    const fromId = this.sanitizeId(edge.from);
    const toId = this.sanitizeId(edge.to);
    let label = '';
    let style = 'solid';
    let color = 'black';

    switch (edge.type) {
      case 'true':
        label = 'true';
        color = 'green';
        break;
      case 'false':
        label = 'false';
        color = 'red';
        break;
      case 'case':
        color = 'blue';
        break;
      case 'exception':
        label = 'exception';
        color = 'red';
        style = 'dashed';
        break;
      case 'finally':
        color = 'purple';
        style = 'dashed';
        break;
      case 'loop_back':
        color = 'blue';
        style = 'dashed';
        break;
      case 'loop_body':
        color = 'blue';
        break;
      case 'sequence':
      default:
        // Default sequence flow
        break;
    }

    const labelAttr = label ? ` label="${label}"` : '';
    return `  ${fromId} -> ${toId} [color="${color}", style="${style}"${labelAttr}];\n`;
  }

  private sanitizeId(id: string): string {
    if (!id) {
      console.warn('⚠️ Empty or null ID found in control flow diagram generation');
      return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private escapeLabel(label: string): string {
    return label
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  saveToFile(dotContent: string, filePath: string): void {
    const fs = require('fs');
    fs.writeFileSync(filePath, dotContent, 'utf8');
  }
}