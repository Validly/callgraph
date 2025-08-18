import { MiroApi } from "@mirohq/miro-api";
import { config } from "dotenv";
import * as fs from "fs";
import { CallGraph, CallGraphNode, HighLevelCallGraph } from "./types.js";
import {
  LayoutExtractor,
  GraphLayout,
  NodeLayout,
  ClusterLayout,
} from "./layout.js";

// Load environment variables
config();

export interface MiroNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  shape: string;
}

/**
 * Miro board generator for call graphs
 */
export class MiroCallGraphGenerator {
  private miro: MiroApi;
  private layoutExtractor: LayoutExtractor;

  constructor() {
    const accessToken = process.env.MIRO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("MIRO_ACCESS_TOKEN environment variable is required");
    }

    this.miro = new MiroApi(accessToken);
    this.layoutExtractor = new LayoutExtractor();
  }

  /**
   * Create a new Miro board with the call graph
   */
  async createBoard(
    callGraph: CallGraph,
    dotContent: string,
    boardName: string = "Call Graph"
  ): Promise<string> {
    try {
      // Create new board
      console.log("🎨 Creating Miro board...");
      const board = await this.miro.createBoard({
        name: boardName,
      });

      console.log(`📋 Board created: ${board.name} (${board.id})`);

      // Extract layout from DOT content
      console.log("📐 Extracting layout from Graphviz...");
      const layout = await this.layoutExtractor.extractLayout(dotContent);

      // Use original coordinates without additional scaling
      const scaledLayout = this.layoutExtractor.convertToMiroCoordinates(
        layout,
        1
      );

      // Log all positions to file for debugging
      const positionLog = [];

      // Create clusters first (background layer)
      console.log(`📦 Creating ${scaledLayout.clusters.size} clusters...`);
      const createdClusters = await this.createClusters(
        board.id,
        scaledLayout,
        positionLog
      );

      // Create nodes on the board (foreground layer)
      console.log(`🔵 Creating ${scaledLayout.nodes.size} nodes...`);
      const createdItems = await this.createNodes(
        board.id,
        callGraph,
        scaledLayout,
        positionLog
      );

      // Write position log to file
      fs.writeFileSync(
        "miro-positions.json",
        JSON.stringify(positionLog, null, 2)
      );
      console.log(`📍 Position data logged to miro-positions.json`);

      // Create groups for clusters
      console.log(`🗂️  Creating groups for clusters...`);
      await this.createGroups(
        board.id,
        callGraph,
        scaledLayout,
        createdClusters,
        createdItems
      );

      // Create connections
      console.log(`🔗 Creating ${callGraph.edges.length} connections...`);
      await this.createConnections(
        board.id,
        callGraph,
        scaledLayout,
        createdItems,
        createdClusters
      );

      return board.viewLink;
    } catch (error) {
      console.error("❌ Error creating Miro board:", error);
      throw error;
    }
  }

  /**
   * Create a synthetic CallGraph from high-level data that matches the DOT structure
   */
  private createHighLevelCallGraph(highLevelGraph: HighLevelCallGraph): CallGraph {
    const nodes = new Map<string, CallGraphNode>();
    const edges = [];
    const files = new Map<string, string[]>();
    const classes = new Map<string, string[]>();

    // Collect all files that are referenced in edges (both as sources and targets)
    const referencedFiles = new Set<string>();
    for (const edge of highLevelGraph.edges) {
      if (edge.from.type === 'file') {
        referencedFiles.add(edge.from.name);
      }
      if (edge.to.type === 'file') {
        referencedFiles.add(edge.to.name);
      }
    }
    
    // Create nodes for all referenced files
    for (const file of referencedFiles) {
      const sanitized = file.replace(/[^a-zA-Z0-9_]/g, '_');
      const fileName = file.split('/').pop() || file;
      
      nodes.set(sanitized, {
        id: sanitized,
        type: 'function', // Use function type for files in high-level view
        name: fileName,
        file: file
      });
      files.set(file, [sanitized]);
    }

    // Create nodes for classes
    for (const [className, file] of highLevelGraph.classes) {
      const sanitized = `${file.replace(/[^a-zA-Z0-9_]/g, '_')}__${className.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      
      nodes.set(sanitized, {
        id: sanitized,
        type: 'class',
        name: className,
        file: file,
        className: className
      });
      
      // Add to files map
      if (files.has(file)) {
        files.get(file)!.push(sanitized);
      } else {
        files.set(file, [sanitized]);
      }
      
      // Add to classes map
      classes.set(className, [sanitized]);
    }

    // Create edges from high-level relationships
    for (const edge of highLevelGraph.edges) {
      let fromId: string;
      let toId: string;

      // Generate from ID
      if (edge.from.type === 'class') {
        fromId = `${edge.from.file!.replace(/[^a-zA-Z0-9_]/g, '_')}__${edge.from.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      } else {
        fromId = edge.from.name.replace(/[^a-zA-Z0-9_]/g, '_');
      }

      // Generate to ID
      if (edge.to.type === 'class') {
        toId = `${edge.to.file!.replace(/[^a-zA-Z0-9_]/g, '_')}__${edge.to.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      } else {
        toId = edge.to.name.replace(/[^a-zA-Z0-9_]/g, '_');
      }

      // Add multiple edges to represent call count
      for (let i = 0; i < edge.callCount; i++) {
        edges.push({
          from: fromId,
          to: toId,
          type: 'call' as 'call'
        });
      }
    }

    return {
      nodes,
      edges,
      files,
      classes
    };
  }

  /**
   * Create clusters on the Miro board
   */
  private async createClusters(
    boardId: string,
    layout: GraphLayout,
    positionLog: any[]
  ): Promise<Map<string, any>> {
    const clusters = [];
    const createdClusters = new Map<string, any>();

    // Sort clusters to render file clusters first (lower z-index), then class clusters
    const sortedClusters = Array.from(layout.clusters.entries()).sort(
      ([, a], [, b]) => {
        if (a.type === "file" && b.type === "class") return -1;
        if (a.type === "class" && b.type === "file") return 1;
        return 0;
      }
    );

    for (const [clusterId, cluster] of sortedClusters) {
      const miroCluster = this.createMiroCluster(cluster, clusterId);
      clusters.push({ clusterId, cluster: miroCluster });
    }

    // Create clusters individually
    for (const { clusterId, cluster } of clusters) {
      try {
        // Log cluster position
        positionLog.push({
          type: "cluster",
          id: clusterId,
          label: layout.clusters.get(clusterId)?.label,
          clusterType: layout.clusters.get(clusterId)?.type,
          position: cluster.position,
          geometry: cluster.geometry,
        });

        const createdCluster = await this.miro._api.createShapeItem(
          boardId,
          cluster
        );
        createdClusters.set(clusterId, createdCluster);
        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.warn(
          `⚠️  Failed to create cluster ${cluster.data?.content}:`,
          error.message
        );
      }
    }

    return createdClusters;
  }

  /**
   * Create nodes on the Miro board
   */
  private async createNodes(
    boardId: string,
    callGraph: CallGraph,
    layout: GraphLayout,
    positionLog: any[]
  ): Promise<Map<string, any>> {
    const shapes = [];
    const createdNodes = new Map<string, any>();

    // Helper function to sanitize IDs the same way as diagram.ts
    const sanitizeId = (id: string): string =>
      id.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const [nodeId, node] of callGraph.nodes) {
      const sanitizedId = sanitizeId(nodeId);
      const nodeLayout = layout.nodes.get(sanitizedId);
      if (!nodeLayout) {
        console.warn(
          `⚠️  No layout found for node: ${nodeId} (sanitized: ${sanitizedId})`
        );
        continue;
      }

      const miroNode = this.createMiroNode(node, nodeLayout, sanitizedId);
      shapes.push({ nodeId, shape: miroNode });
    }

    // Create shapes individually to avoid API rate limits
    for (const { nodeId, shape } of shapes) {
      try {
        // Log node position
        positionLog.push({
          type: "node",
          id: nodeId,
          label: callGraph.nodes.get(nodeId)?.name,
          nodeType: callGraph.nodes.get(nodeId)?.type,
          position: shape.position,
          geometry: shape.geometry,
        });

        const createdShape = await this.miro._api.createShapeItem(
          boardId,
          shape
        );
        createdNodes.set(nodeId, createdShape);

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`⚠️  Failed to create shape:`, error.message);
      }
    }

    return createdNodes;
  }

  /**
   * Create connections between nodes
   */
  private async createConnections(
    boardId: string,
    callGraph: CallGraph,
    layout: GraphLayout,
    createdNodes: Map<string, any>,
    createdClusters: Map<string, any>
  ): Promise<void> {
    const connectors = [];
    const seenConnections = new Set<string>(); // Track unique connections

    // Helper function to sanitize IDs the same way as diagram.ts
    const sanitizeId = (id: string): string =>
      id.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const edge of callGraph.edges) {
      let fromItemId: string;
      let toItemId: string;
      let connectionKey: string;

      // Get the created Miro items for start node
      const fromNode = createdNodes.get(edge.from);
      if (!fromNode?.body?.id) {
        console.warn(
          `⚠️  Cannot create connection: missing created node for ${edge.from}`
        );
        continue;
      }
      fromItemId = fromNode.body.id;

      // Handle instantiation calls differently - connect to class cluster instead of constructor
      if (edge.type === "instantiation") {
        // Find the target class name from the edge.to node
        const toNode = callGraph.nodes.get(edge.to);
        if (toNode && toNode.className) {
          // Look for a class cluster for this class
          // Pattern: cluster_filename_ClassName (where filename has . replaced with _)
          const sanitizedClassName = sanitizeId(toNode.className);
          const sanitizedFileName = sanitizeId(toNode.file); // Keep the extension, just sanitize
          const classClusterId = `cluster_${sanitizedFileName}_${sanitizedClassName}`;
          
          const classCluster = createdClusters.get(classClusterId);
          if (classCluster?.body?.id) {
            toItemId = classCluster.body.id;
            connectionKey = `${fromItemId}->${toItemId}`;
          } else {
            // Fallback to regular node if no class cluster found
            const toNodeCreated = createdNodes.get(edge.to);
            if (!toNodeCreated?.body?.id) {
              console.warn(
                `⚠️  Cannot create instantiation connection: missing class cluster and node for ${edge.to}`
              );
              continue;
            }
            toItemId = toNodeCreated.body.id;
            connectionKey = `${fromItemId}->${toItemId}`;
          }
        } else {
          // Fallback to regular node connection
          const toNodeCreated = createdNodes.get(edge.to);
          if (!toNodeCreated?.body?.id) {
            console.warn(
              `⚠️  Cannot create connection: missing created node for ${edge.to}`
            );
            continue;
          }
          toItemId = toNodeCreated.body.id;
          connectionKey = `${fromItemId}->${toItemId}`;
        }
      } else {
        // Regular function calls - connect to the specific node
        const toNodeCreated = createdNodes.get(edge.to);
        if (!toNodeCreated?.body?.id) {
          console.warn(
            `⚠️  Cannot create connection: missing created node for ${edge.to}`
          );
          continue;
        }
        toItemId = toNodeCreated.body.id;
        connectionKey = `${fromItemId}->${toItemId}`;
      }

      // Skip self-referencing connections
      if (fromItemId === toItemId) {
        continue;
      }

      // Create unique key for this connection to avoid duplicates
      if (seenConnections.has(connectionKey)) {
        continue;
      }
      seenConnections.add(connectionKey);

      // Handle data flow arrow heads for Miro visualization
      let startStrokeCap = "none";
      let endStrokeCap = "none";
      
      if (edge.sendsData && edge.returnsData) {
        // Bidirectional data flow - both arrow heads
        startStrokeCap = "stealth";
        endStrokeCap = "stealth";
      } else if (edge.sendsData) {
        // Only sends data - forward arrow (default)
        endStrokeCap = "stealth";
      } else if (edge.returnsData) {
        // Only returns data - reverse arrow  
        startStrokeCap = "stealth";
      }
      // If neither sendsData nor returnsData, both caps remain "none"

      const connector = {
        startItem: { id: fromItemId },
        endItem: { id: toItemId },
        shape: "curved",
        style: {
          strokeColor: edge.type === "instantiation" ? "#ff6b6b" : "#4ecdc4",
          strokeWidth: "2",
          strokeStyle: edge.type === "instantiation" ? "dashed" : "normal",
          startStrokeCap,
          endStrokeCap,
        },
      };

      connectors.push(connector);
    }

    // Create connectors individually
    for (const connector of connectors) {
      try {
        await this.miro._api.createConnector(boardId, connector);
        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Failed to create connector:`, error);
        console.error(
          `📤 Request payload was:`,
          JSON.stringify(connector, null, 2)
        );
        if (error.response) {
          console.error(`📥 Response status:`, error.response.status);
          console.error(`📥 Response headers:`, error.response.headers);
          console.error(
            `📥 Response body:`,
            await error.response
              .text()
              .catch(() => "Unable to read response body")
          );
        }
        // Continue with other connectors
      }
    }
  }

  /**
   * Convert ClusterLayout to Miro shape format
   */
  private createMiroCluster(cluster: ClusterLayout, clusterId: string) {
    const colors = {
      file: "#f8f9fa", // Light gray background for files
      class: "#e3f2fd", // Light blue background for classes
    };

    const borderColors = {
      file: "#6c757d", // Gray border for files
      class: "#2196f3", // Blue border for classes
    };

    const borderStyles = {
      file: "dashed", // Dashed border for files
      class: "normal", // Solid border for classes
    };

    // Z-index: file clusters behind class clusters
    const zIndex = cluster.type === "file" ? 1 : 2;

    return {
      data: {
        content: `<p><strong>${cluster.label}</strong></p>`,
        shape: "rectangle",
      },
      style: {
        fillColor: colors[cluster.type],
        fillOpacity: 0.3, // Semi-transparent background
        fontFamily: "arial",
        fontSize: 12,
        textAlign: "left",
        textAlignVertical: "top",
        borderColor: borderColors[cluster.type],
        borderWidth: cluster.type === "file" ? 2 : 1,
        borderOpacity: 0.7,
        borderStyle: borderStyles[cluster.type],
      },
      position: {
        x: cluster.x,
        y: cluster.y,
      },
      geometry: {
        width: cluster.width,
        height: cluster.height,
      },
    };
  }

  /**
   * Convert CallGraphNode to Miro shape format
   */
  private createMiroNode(
    node: CallGraphNode,
    layout: NodeLayout,
    sanitizedId?: string
  ) {
    const colors = {
      function: "#e1f5fe",
      method: "#f3e5f5",
      class: "#fff3e0",
    };

    const shapes = {
      function: "round_rectangle",
      method: "round_rectangle",
      class: "rectangle",
    };

    // Use the Graphviz label instead of constructing our own display name
    const displayName = layout.label;

    const fileName = node.file.split("/").pop() || node.file;

    return {
      data: {
        content: displayName,
        shape: shapes[node.type],
      },
      style: {
        fillColor: colors[node.type],
        fontFamily: "arial",
        fontSize: 14,
        textAlign: "center",
        borderColor: "#333333",
        borderWidth: 1,
        borderOpacity: 1.0,
      },
      position: {
        x: layout.x,
        y: layout.y,
      },
      geometry: {
        width: layout.width,
        height: layout.height,
      },
    };
  }

  /**
   * Create groups for clusters
   */
  private async createGroups(
    boardId: string,
    callGraph: CallGraph,
    layout: GraphLayout,
    createdClusters: Map<string, any>,
    createdNodes: Map<string, any>
  ): Promise<void> {
    // Helper function to sanitize IDs the same way as diagram.ts
    const sanitizeId = (id: string): string =>
      id.replace(/[^a-zA-Z0-9_]/g, "_");

    // Create class-level groups first
    const classGroups = new Map<string, any>();

    for (const [clusterId, cluster] of layout.clusters) {
      if (cluster.type === "class") {
        const itemIds = [];

        // Add the cluster background rectangle
        const clusterItem = createdClusters.get(clusterId);
        if (clusterItem?.body?.id) {
          itemIds.push(clusterItem.body.id);
        }

        // Find all nodes that belong to this class
        for (const [nodeId, node] of callGraph.nodes) {
          if (
            node.className &&
            clusterId.includes(sanitizeId(node.className))
          ) {
            const createdNode = createdNodes.get(nodeId);
            if (createdNode?.body?.id) {
              itemIds.push(createdNode.body.id);
            }
          }
        }

        if (itemIds.length > 1) {
          try {
            const group = await this.miro._api.createGroup(boardId, {
              itemIds,
            });
            classGroups.set(clusterId, group);
            console.log(
              `📁 Created class group for ${cluster.label} with ${itemIds.length} items`
            );
          } catch (error) {
            console.warn(
              `⚠️  Failed to create class group for ${cluster.label}:`,
              error.message
            );
            console.warn(`⚠️  Group creation error details:`, error);
          }
        }
      }
    }

    // Create file-level groups
    for (const [clusterId, cluster] of layout.clusters) {
      if (cluster.type === "file") {
        const itemIds = [];

        // Add the file cluster background rectangle
        const clusterItem = createdClusters.get(clusterId);
        if (clusterItem?.body?.id) {
          itemIds.push(clusterItem.body.id);
        }

        // Add all class groups within this file
        for (const [classClusterId, classGroup] of classGroups) {
          const classCluster = layout.clusters.get(classClusterId);
          if (
            classCluster &&
            clusterId.includes(cluster.label.replace(".", "_"))
          ) {
            if (classGroup?.body?.id) {
              itemIds.push(classGroup.body.id);
            }
          }
        }

        // Add any standalone nodes in this file (not part of a class)
        for (const [nodeId, node] of callGraph.nodes) {
          if (node.file.includes(cluster.label) && !node.className) {
            const createdNode = createdNodes.get(nodeId);
            if (createdNode?.body?.id) {
              itemIds.push(createdNode.body.id);
            }
          }
        }

        if (itemIds.length > 1) {
          try {
            await this.miro._api.createGroup(boardId, { itemIds });
            console.log(
              `📁 Created file group for ${cluster.label} with ${itemIds.length} items`
            );
          } catch (error) {
            console.warn(
              `⚠️  Failed to create file group for ${cluster.label}:`,
              error.message
            );
            console.warn(`⚠️  Group creation error details:`, error);
          }
        }
      }
    }
  }

  /**
   * Get list of user's boards
   */
  async listBoards(): Promise<
    Array<{ id: string; name: string; viewLink: string }>
  > {
    try {
      const boards = await this.miro.getBoards();
      return boards.data.map((board) => ({
        id: board.id,
        name: board.name,
        viewLink: board.viewLink,
      }));
    } catch (error) {
      console.error("❌ Error listing boards:", error);
      throw error;
    }
  }
}
