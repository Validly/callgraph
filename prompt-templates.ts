export interface PromptTemplate {
  name: string;
  description: string;
  template: string;
  variables: string[];
}

export interface PromptVariables {
  [key: string]: string;
}

export class PromptTemplateEngine {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  renderTemplate(templateName: string, variables: PromptVariables): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
    }

    return rendered;
  }

  private registerDefaultTemplates(): void {
    this.registerTemplate({
      name: 'callgraph-basic',
      description: 'Basic call graph generation from source code',
      variables: ['projectName', 'sourceCode'],
      template: `Analyze the following source code from the project "{{projectName}}" and generate a call graph showing function and method relationships.

Please respond with a JSON object in this exact format:
{
  "nodes": [
    {
      "id": "unique-identifier",
      "name": "function-name", 
      "type": "function|method|class",
      "file": "relative/file/path.ts",
      "className": "ClassName (if applicable)"
    }
  ],
  "edges": [
    {
      "from": "caller-id",
      "to": "callee-id", 
      "type": "call|instantiation",
      "sendsData": boolean,
      "returnsData": boolean
    }
  ]
}

Rules:
- Use format "file::class::method" or "file::function" for node IDs
- Include all functions, methods, and classes you can identify
- Track all function calls and class instantiations 
- Set sendsData=true if call has parameters, returnsData=true if return value is used
- Be thorough but focus on meaningful relationships

Source Code:
{{sourceCode}}`
    });

    this.registerTemplate({
      name: 'callgraph-detailed',
      description: 'Detailed call graph with additional metadata',
      variables: ['projectName', 'sourceCode', 'analysisGoal'],
      template: `Perform a detailed analysis of the source code from "{{projectName}}" to generate a comprehensive call graph.

Analysis Goal: {{analysisGoal}}

Please respond with a JSON object in this exact format:
{
  "nodes": [
    {
      "id": "unique-identifier",
      "name": "function-name",
      "type": "function|method|class|constructor|getter|setter",
      "file": "relative/file/path.ts",
      "className": "ClassName (if applicable)",
      "isAsync": boolean,
      "isExported": boolean,
      "parameters": ["param1", "param2"],
      "returnType": "string (if determinable)"
    }
  ],
  "edges": [
    {
      "from": "caller-id",
      "to": "callee-id",
      "type": "call|instantiation|inheritance|import",
      "sendsData": boolean,
      "returnsData": boolean,
      "callContext": "string describing the context"
    }
  ]
}

Focus on:
- All function and method definitions
- Class relationships (inheritance, composition)
- Import/export relationships
- Async/await patterns
- Constructor calls and object instantiation
- Method chaining patterns

Source Code:
{{sourceCode}}`
    });

    this.registerTemplate({
      name: 'callgraph-architecture',
      description: 'High-level architectural analysis focusing on modules and components',
      variables: ['projectName', 'sourceCode'],
      template: `Analyze the architecture of "{{projectName}}" and create a high-level call graph focusing on modules, components, and major architectural patterns.

Please respond with a JSON object in this exact format:
{
  "nodes": [
    {
      "id": "unique-identifier",
      "name": "module-or-component-name",
      "type": "module|component|service|utility|config",
      "file": "relative/file/path.ts",
      "description": "Brief description of purpose",
      "isEntryPoint": boolean
    }
  ],
  "edges": [
    {
      "from": "consumer-id",
      "to": "provider-id", 
      "type": "depends|imports|extends|implements",
      "relationship": "string describing the relationship"
    }
  ]
}

Focus on:
- Module dependencies and imports
- Major components and their interactions
- Service layer relationships
- Configuration and utility usage
- Entry points and main execution flows
- Architectural patterns (MVC, layered, etc.)

Ignore:
- Individual function calls within modules
- Trivial utility usage
- Test files and development dependencies

Source Code:
{{sourceCode}}`
    });

    this.registerTemplate({
      name: 'callgraph-debug',
      description: 'Debug-focused analysis for understanding code flow',
      variables: ['projectName', 'sourceCode', 'debugTarget'],
      template: `Analyze "{{projectName}}" source code to understand the execution flow and debug information, with special focus on: {{debugTarget}}

Please respond with a JSON object in this exact format:
{
  "nodes": [
    {
      "id": "unique-identifier", 
      "name": "function-name",
      "type": "function|method|class|entrypoint|errorhandler",
      "file": "relative/file/path.ts",
      "className": "ClassName (if applicable)",
      "callFrequency": "high|medium|low|unknown",
      "hasErrorHandling": boolean,
      "isEntryPoint": boolean
    }
  ],
  "edges": [
    {
      "from": "caller-id",
      "to": "callee-id",
      "type": "call|instantiation|error|async",
      "executionOrder": "number (if determinable)",
      "isConditional": boolean,
      "errorPath": boolean
    }
  ]
}

Focus on:
- Entry points and main execution flows
- Error handling and exception paths
- Async operations and callbacks
- Conditional execution branches
- Frequently called functions
- Resource cleanup and lifecycle methods

Source Code:
{{sourceCode}}`
    });

    this.registerTemplate({
      name: 'hybrid-clustering',
      description: 'Analyze call graph edges and suggest domain-based clusters',
      variables: ['projectName', 'edges', 'nodes'],
      template: `Analyze the following function call relationships from the project "{{projectName}}" and suggest meaningful domain-based clusters/groupings.

You have the precise call graph edges from AST analysis:

NODES:
{{nodes}}

EDGES:
{{edges}}

Please respond with a JSON object suggesting domain-based clusters in this exact format:
{
  "clusters": [
    {
      "id": "cluster-name",
      "name": "Human Readable Cluster Name",
      "description": "What this cluster represents",
      "domain": "business-domain-name",
      "nodes": ["node-id-1", "node-id-2"],
      "reasoning": "Why these nodes belong together"
    }
  ],
  "reasoning": "Overall reasoning for the clustering approach"
}

Focus on creating clusters that represent:
- Business domains (authentication, data processing, UI, etc.)
- Functional cohesion (nodes that work together toward a common goal)
- Architectural layers (presentation, business logic, data access)
- Feature boundaries (user management, reporting, etc.)

Ignore file-based or class-based groupings - focus on semantic/functional relationships that make sense from a domain perspective.`
    });

    this.registerTemplate({
      name: 'hybrid-clustering-detailed',
      description: 'Detailed domain boundary analysis with architectural insights',
      variables: ['projectName', 'edges', 'nodes', 'sourceContext'],
      template: `Perform detailed domain boundary analysis for "{{projectName}}" based on precise call graph data and source code context.

CALL GRAPH DATA:
NODES: {{nodes}}
EDGES: {{edges}}

SOURCE CODE CONTEXT:
{{sourceContext}}

Please respond with a comprehensive JSON object in this exact format:
{
  "clusters": [
    {
      "id": "cluster-id",
      "name": "Domain Name",
      "description": "Detailed description of this domain",
      "domain": "domain-category",
      "pattern": "architectural-pattern-used",
      "nodes": ["node-id-1", "node-id-2"],
      "responsibilities": ["responsibility-1", "responsibility-2"],
      "dependencies": ["depends-on-cluster-id"],
      "cohesion": "high|medium|low",
      "reasoning": "Detailed reasoning for this cluster"
    }
  ],
  "architecture": {
    "style": "layered|microkernel|event-driven|etc",
    "layers": ["presentation", "business", "data"],
    "patterns": ["pattern-1", "pattern-2"]
  },
  "reasoning": "Overall architectural analysis and clustering rationale"
}

Consider these domain boundaries:
- **Core Business Logic**: Domain models, business rules, calculations
- **Data Access**: Database operations, API calls, file I/O
- **Presentation**: UI components, formatting, user interaction
- **Integration**: External service calls, message queues, adapters  
- **Infrastructure**: Configuration, logging, monitoring, utilities
- **Security**: Authentication, authorization, encryption
- **Validation**: Input validation, business rule validation

Analyze the calling patterns to identify:
- Which functions collaborate frequently (high cohesion)
- Which represent distinct responsibilities (separation of concerns)
- Which form natural architectural boundaries
- Which implement specific business capabilities`
    });
  }
}

export const promptEngine = new PromptTemplateEngine();