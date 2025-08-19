import type { CallGraph, CallGraphNode, CallGraphEdge } from './types.js';

export interface LLMCallGraphResponse {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    file: string;
    className?: string;
    isAsync?: boolean;
    isExported?: boolean;
    parameters?: string[];
    returnType?: string;
    description?: string;
    isEntryPoint?: boolean;
    callFrequency?: string;
    hasErrorHandling?: boolean;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    sendsData?: boolean;
    returnsData?: boolean;
    callContext?: string;
    relationship?: string;
    executionOrder?: number;
    isConditional?: boolean;
    errorPath?: boolean;
  }>;
}

export class LLMResponseParser {
  parseCallGraph(response: string): CallGraph {
    try {
      const parsedResponse = this.parseJSONResponse(response);
      return this.convertToCallGraph(parsedResponse);
    } catch (jsonError) {
      try {
        return this.parseDotResponse(response);
      } catch (dotError) {
        try {
          return this.parseNaturalLanguageResponse(response);
        } catch (nlError) {
          throw new Error(`Failed to parse LLM response in any format. JSON Error: ${jsonError.message}, DOT Error: ${dotError.message}, NL Error: ${nlError.message}`);
        }
      }
    }
  }

  private parseJSONResponse(response: string): LLMCallGraphResponse {
    const cleanedResponse = this.extractJSONFromResponse(response);
    const parsed = JSON.parse(cleanedResponse);

    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
      throw new Error('Invalid response: missing or invalid nodes array');
    }

    if (!parsed.edges || !Array.isArray(parsed.edges)) {
      throw new Error('Invalid response: missing or invalid edges array');
    }

    return parsed as LLMCallGraphResponse;
  }

  private extractJSONFromResponse(response: string): string {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    return jsonMatch[0];
  }

  private convertToCallGraph(response: LLMCallGraphResponse): CallGraph {
    const callGraph: CallGraph = {
      nodes: new Map(),
      edges: [],
      files: new Map(),
      classes: new Map()
    };

    for (const node of response.nodes) {
      const callGraphNode: CallGraphNode = {
        id: this.sanitizeId(node.id),
        name: node.name,
        type: this.mapNodeType(node.type),
        file: node.file,
        className: node.className
      };

      callGraph.nodes.set(callGraphNode.id, callGraphNode);

      if (!callGraph.files.has(node.file)) {
        callGraph.files.set(node.file, []);
      }
      callGraph.files.get(node.file)!.push(callGraphNode.id);

      if (node.className) {
        const classKey = `${node.file}::${node.className}`;
        if (!callGraph.classes.has(classKey)) {
          callGraph.classes.set(classKey, []);
        }
        callGraph.classes.get(classKey)!.push(callGraphNode.id);
      }
    }

    for (const edge of response.edges) {
      const callGraphEdge: CallGraphEdge = {
        from: this.sanitizeId(edge.from),
        to: this.sanitizeId(edge.to),
        type: this.mapEdgeType(edge.type),
        sendsData: edge.sendsData,
        returnsData: edge.returnsData
      };

      callGraph.edges.push(callGraphEdge);
    }

    return callGraph;
  }

  private parseDotResponse(response: string): CallGraph {
    const callGraph: CallGraph = {
      nodes: new Map(),
      edges: [],
      files: new Map(),
      classes: new Map()
    };

    const nodeMatches = response.matchAll(/(\w+)\s*\[([^\]]*)\]/g);
    for (const match of nodeMatches) {
      const [, id, attributes] = match;
      const labelMatch = attributes.match(/label="([^"]+)"/);
      const label = labelMatch ? labelMatch[1] : id;

      const node: CallGraphNode = {
        id: this.sanitizeId(id),
        name: label,
        type: 'function',
        file: 'unknown.ts'
      };

      callGraph.nodes.set(node.id, node);
    }

    const edgeMatches = response.matchAll(/(\w+)\s*->\s*(\w+)/g);
    for (const match of edgeMatches) {
      const [, from, to] = match;
      const edge: CallGraphEdge = {
        from: this.sanitizeId(from),
        to: this.sanitizeId(to),
        type: 'call'
      };

      callGraph.edges.push(edge);
    }

    return callGraph;
  }

  private parseNaturalLanguageResponse(response: string): CallGraph {
    const callGraph: CallGraph = {
      nodes: new Map(),
      edges: [],
      files: new Map(),
      classes: new Map()
    };

    const functionMatches = response.matchAll(/(?:function|method|class)\s+`?(\w+)`?/gi);
    const functionSet = new Set<string>();

    for (const match of functionMatches) {
      const functionName = match[1];
      if (!functionSet.has(functionName)) {
        functionSet.add(functionName);
        const node: CallGraphNode = {
          id: this.sanitizeId(functionName),
          name: functionName,
          type: 'function',
          file: 'extracted.ts'
        };
        callGraph.nodes.set(node.id, node);
      }
    }

    const callMatches = response.matchAll(/`?(\w+)`?\s+(?:calls?|invokes?|uses?)\s+`?(\w+)`?/gi);
    for (const match of callMatches) {
      const [, from, to] = match;
      if (functionSet.has(from) && functionSet.has(to)) {
        const edge: CallGraphEdge = {
          from: this.sanitizeId(from),
          to: this.sanitizeId(to),
          type: 'call'
        };
        callGraph.edges.push(edge);
      }
    }

    if (callGraph.nodes.size === 0) {
      throw new Error('Could not extract any functions from natural language response');
    }

    return callGraph;
  }

  private sanitizeId(id: string): string {
    if (!id) {
      console.warn('⚠️ Empty or null ID found in LLM response, generating fallback ID');
      return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private mapNodeType(type: string): 'function' | 'method' | 'class' {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('class')) return 'class';
    if (lowerType.includes('method')) return 'method';
    return 'function';
  }

  private mapEdgeType(type: string): 'call' | 'instantiation' {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('instantiat') || lowerType.includes('new') || lowerType.includes('creat')) {
      return 'instantiation';
    }
    return 'call';
  }

  validateResponse(response: LLMCallGraphResponse): string[] {
    const errors: string[] = [];

    if (!response.nodes || response.nodes.length === 0) {
      errors.push('No nodes found in response');
    } else {
      const nodeIds = new Set<string>();
      for (const node of response.nodes) {
        if (!node.id || !node.name || !node.type || !node.file) {
          errors.push(`Invalid node: missing required fields (id: ${node.id}, name: ${node.name}, type: ${node.type}, file: ${node.file})`);
        }
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }
        nodeIds.add(node.id);
      }

      if (response.edges) {
        for (const edge of response.edges) {
          if (!edge.from || !edge.to) {
            errors.push(`Invalid edge: missing from/to fields (from: ${edge.from}, to: ${edge.to})`);
          }
          if (!nodeIds.has(edge.from)) {
            errors.push(`Edge references unknown node: ${edge.from}`);
          }
          if (!nodeIds.has(edge.to)) {
            errors.push(`Edge references unknown node: ${edge.to}`);
          }
        }
      }
    }

    return errors;
  }
}