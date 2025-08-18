import { CallGraph, CallGraphNode } from './types.js';
import { GraphvizRenderer } from './svg-generator.js';

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface ClusterLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type: 'file' | 'class';
}

export interface GraphLayout {
  nodes: Map<string, NodeLayout>;
  clusters: Map<string, ClusterLayout>;
  width: number;
  height: number;
}

/**
 * Extract layout information from a DOT file using Graphviz
 */
export class LayoutExtractor {
  private graphvizRenderer = new GraphvizRenderer();
  
  /**
   * Run graphviz dot command and extract node positions
   */
  async extractLayout(dotContent: string): Promise<GraphLayout> {
    try {
      const output = await this.graphvizRenderer.executeGraphviz(dotContent, 'json');
      return this.parseJsonOutput(output);
    } catch (error) {
      throw new Error(`Failed to extract layout: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  /**
   * Parse the JSON output from graphviz
   */
  private parseJsonOutput(jsonOutput: string): GraphLayout {
    const graphData = JSON.parse(jsonOutput);
    const nodes = new Map<string, NodeLayout>();
    const clusters = new Map<string, ClusterLayout>();
    
    // Get graph dimensions
    const bbox = graphData.bb || "0,0,100,100"; // fallback if no bounding box
    const [minX, minY, maxX, maxY] = bbox.split(',').map(Number);
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    
    // Extract nodes and clusters from objects
    if (graphData.objects) {
      for (const obj of graphData.objects) {
        if (obj._draw_ && obj.name) {
          
          // Handle clusters
          if (obj.name.startsWith('cluster_')) {
            // Find the polygon drawing command which contains the cluster boundary (lowercase 'p')
            const polyCmd = obj._draw_.find(cmd => cmd.op === 'p' || cmd.op === 'P');
            if (polyCmd && polyCmd.points && polyCmd.points.length >= 4) {
              // Get bounding box from polygon points
              const points = polyCmd.points;
              const xs = points.map(p => p[0]);
              const ys = points.map(p => p[1]);
              const minClusterX = Math.min(...xs);
              const maxClusterX = Math.max(...xs);
              const minClusterY = Math.min(...ys);
              const maxClusterY = Math.max(...ys);
              
              const width = maxClusterX - minClusterX;
              const height = maxClusterY - minClusterY;
              
              // Determine cluster type based on name pattern
              // Class clusters: cluster_filename_ClassName (3+ parts)
              // File clusters: cluster_filename (2 parts)
              const parts = obj.name.split('_');
              const isClassCluster = parts.length >= 3 && parts[0] === 'cluster';
              const clusterType = isClassCluster ? 'class' : 'file';
              
              clusters.set(obj.name, {
                id: obj.name,
                x: minClusterX + (width / 2), // Center point X
                y: graphHeight - (minClusterY + (height / 2)), // Flip Y and center point Y
                width: width,
                height: height,
                label: obj.label || obj.name.replace('cluster_', '').replace(/_/g, '.'),
                type: clusterType
              });
            }
          }
          // Handle individual nodes
          else {
            let nodeLayout = null;
            
            // Try ellipse first (for regular function/method nodes)
            const ellipseCmd = obj._draw_.find(cmd => cmd.op === 'e');
            if (ellipseCmd && ellipseCmd.rect) {
              const [centerX, centerY, semiWidth, semiHeight] = ellipseCmd.rect;
              nodeLayout = {
                x: centerX,
                y: centerY,
                width: semiWidth * 2,
                height: semiHeight * 2
              };
            }
            // Try polygon (for box and folder shapes)
            else {
              const polyCmd = obj._draw_.find(cmd => cmd.op === 'P');
              if (polyCmd && polyCmd.points && polyCmd.points.length >= 4) {
                // Get bounding box from polygon points
                const points = polyCmd.points;
                const xs = points.map(p => p[0]);
                const ys = points.map(p => p[1]);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const width = maxX - minX;
                const height = maxY - minY;
                const centerX = minX + width / 2;
                const centerY = minY + height / 2;
                
                nodeLayout = {
                  x: centerX,
                  y: centerY,
                  width: width,
                  height: height
                };
              }
            }
            
            if (nodeLayout) {
              // Get the label from the text drawing commands or the label field
              let label = obj.label || obj.name;
              const textCmd = obj._ldraw_ && obj._ldraw_.find(cmd => cmd.op === 'T');
              if (textCmd && textCmd.text) {
                label = textCmd.text;
              }
              
              nodes.set(obj.name, {
                id: obj.name,
                x: nodeLayout.x,
                y: graphHeight - nodeLayout.y, // Flip Y coordinate
                width: nodeLayout.width,
                height: nodeLayout.height,
                label: label.replace(/^"|"$/g, '') // Remove quotes from label
              });
            }
          }
        }
      }
    }
    
    return {
      nodes,
      clusters,
      width: graphWidth,
      height: graphHeight
    };
  }
  
  /**
   * Convert graph coordinates to Miro coordinates with scaling
   */
  convertToMiroCoordinates(layout: GraphLayout, scale: number = 1): GraphLayout {
    const scaledNodes = new Map<string, NodeLayout>();
    const scaledClusters = new Map<string, ClusterLayout>();
    
    // COMMENTED OUT: Center the graph around the origin (0,0)
    // const centerX = (layout.width / 2) * scale;
    // const centerY = (layout.height / 2) * scale;
    
    // Use raw coordinates without centering transformation
    for (const [id, node] of layout.nodes) {
      scaledNodes.set(id, {
        ...node,
        x: node.x * scale,  // No centering
        y: node.y * scale,  // No centering
        width: node.width * scale,  // Use actual Graphviz width
        height: node.height * scale // Use actual Graphviz height
      });
    }
    
    // Use raw coordinates without centering transformation
    for (const [id, cluster] of layout.clusters) {
      scaledClusters.set(id, {
        ...cluster,
        x: cluster.x * scale,  // No centering
        y: cluster.y * scale,  // No centering
        width: cluster.width * scale,
        height: cluster.height * scale
      });
    }
    
    return {
      nodes: scaledNodes,
      clusters: scaledClusters,
      width: layout.width * scale,
      height: layout.height * scale
    };
  }
}