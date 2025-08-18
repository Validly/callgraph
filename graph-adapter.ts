import type { CallGraph } from './types.js';
import type { Graph, Node, Edge } from './types.js';

/**
 * Converts the legacy CallGraph format to the new generic Graph format
 */
export function convertCallGraphToGraph(callGraph: CallGraph): Graph {
  const graph: Graph = {
    nodes: new Map(),
    edges: []
  };

  // Create file nodes first
  const fileNodes = new Map<string, Node>();
  
  for (const [fileName, nodeIds] of callGraph.files) {
    const fileNode: Node = {
      id: fileName,
      name: fileName.split('/').pop() || fileName,
      type: 'file',
      metadata: { filePath: fileName },
      children: new Map()
    };
    fileNodes.set(fileName, fileNode);
    graph.nodes.set(fileName, fileNode);
  }

  // Create class nodes
  const classNodes = new Map<string, Node>();
  
  for (const [className, methodIds] of callGraph.classes) {
    // Find which file this class belongs to
    let classFile = '';
    for (const methodId of methodIds) {
      const method = callGraph.nodes.get(methodId);
      if (method) {
        classFile = method.file;
        break;
      }
    }
    
    const classId = `${classFile}::${className}`;
    const classNode: Node = {
      id: classId,
      name: className,
      type: 'class',
      metadata: { file: classFile },
      children: new Map(),
      parent: classFile
    };
    
    classNodes.set(className, classNode);
    graph.nodes.set(classId, classNode);
    
    // Add to file's children
    const fileNode = fileNodes.get(classFile);
    if (fileNode) {
      fileNode.children!.set(classId, classNode);
    }
  }

  // Convert function/method nodes
  for (const [nodeId, callGraphNode] of callGraph.nodes) {
    const node: Node = {
      id: nodeId,
      name: callGraphNode.name,
      type: callGraphNode.type,
      metadata: {
        file: callGraphNode.file,
        className: callGraphNode.className
      },
      parent: callGraphNode.className ? `${callGraphNode.file}::${callGraphNode.className}` : callGraphNode.file
    };

    graph.nodes.set(nodeId, node);

    // Add to parent's children
    if (callGraphNode.className) {
      const classNode = classNodes.get(callGraphNode.className);
      if (classNode) {
        classNode.children!.set(nodeId, node);
      }
    } else {
      const fileNode = fileNodes.get(callGraphNode.file);
      if (fileNode) {
        fileNode.children!.set(nodeId, node);
      }
    }
  }

  // Convert edges
  for (const callGraphEdge of callGraph.edges) {
    const edge: Edge = {
      from: callGraphEdge.from,
      to: callGraphEdge.to,
      type: callGraphEdge.type === 'call' ? 'function_call' : 'instantiation',
      sendsData: callGraphEdge.sendsData,
      returnsData: callGraphEdge.returnsData
    };
    graph.edges.push(edge);
  }

  return graph;
}