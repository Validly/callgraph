import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import type { Graph, Node, Edge } from './types.js';

/**
 * Analyzes TypeScript/JavaScript code to extract function call relationships.
 * This analyzer uses the TypeScript compiler API to build a call graph showing
 * which functions call which other functions.
 */
export class TypeScriptFunctionCallAnalyzer {
  private graph: Graph = {
    nodes: new Map(),
    edges: []
  };

  analyze(projectPath: string): Graph {
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    let program: ts.Program;
    
    if (fs.existsSync(tsConfigPath)) {
      const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        projectPath
      );
      program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
    } else {
      const files = this.findTsFiles(projectPath);
      program = ts.createProgram(files, { 
        allowJs: true, 
        target: ts.ScriptTarget.ES2020,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        esModuleInterop: true
      });
    }

    for (const sourceFile of program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('node_modules')) {
        this.analyzeFileForFunctionCalls(sourceFile);
      }
    }

    this.findCallRelationships(program);
    return this.graph;
  }

  private findTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.findTsFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private analyzeFileForFunctionCalls(sourceFile: ts.SourceFile) {
    const fileName = path.relative(process.cwd(), sourceFile.fileName);
    
    // Create file node if it doesn't exist
    if (!this.graph.nodes.has(fileName)) {
      const fileNode: Node = {
        id: fileName,
        name: path.basename(fileName),
        type: 'file',
        metadata: { filePath: fileName },
        children: new Map()
      };
      this.graph.nodes.set(fileName, fileNode);
    }

    const visit = (node: ts.Node, currentClass?: string) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const nodeId = this.createNodeId(fileName, node.name.text, currentClass);
        const functionNode: Node = {
          id: nodeId,
          name: node.name.text,
          type: 'function',
          metadata: { file: fileName, className: currentClass },
          parent: currentClass ? `${fileName}::${currentClass}` : fileName
        };
        this.graph.nodes.set(nodeId, functionNode);
        
        // Add to parent's children
        const parentId = currentClass ? `${fileName}::${currentClass}` : fileName;
        const parentNode = this.graph.nodes.get(parentId);
        if (parentNode) {
          parentNode.children!.set(nodeId, functionNode);
        }
      }
      
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const nodeId = this.createNodeId(fileName, node.name.text, currentClass);
        const methodNode: Node = {
          id: nodeId,
          name: node.name.text,
          type: 'method',
          metadata: { file: fileName, className: currentClass },
          parent: currentClass ? `${fileName}::${currentClass}` : fileName
        };
        this.graph.nodes.set(nodeId, methodNode);
        
        // Add to parent's children
        const parentId = currentClass ? `${fileName}::${currentClass}` : fileName;
        const parentNode = this.graph.nodes.get(parentId);
        if (parentNode) {
          parentNode.children!.set(nodeId, methodNode);
        }
      }
      
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const classId = `${fileName}::${className}`;
        
        // Create class node
        const classNode: Node = {
          id: classId,
          name: className,
          type: 'class',
          metadata: { file: fileName },
          children: new Map(),
          parent: fileName
        };
        this.graph.nodes.set(classId, classNode);
        
        // Add to file's children
        const fileNode = this.graph.nodes.get(fileName);
        if (fileNode) {
          fileNode.children!.set(classId, classNode);
        }
        
        ts.forEachChild(node, child => visit(child, className));
        return;
      }
      
      ts.forEachChild(node, child => visit(child, currentClass));
    };

    visit(sourceFile);
  }

  private findCallRelationships(program: ts.Program) {
    const typeChecker = program.getTypeChecker();
    
    for (const sourceFile of program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('node_modules')) {
        this.findCallsInFile(sourceFile, typeChecker);
      }
    }
  }


  private resolveCallTarget(node: ts.CallExpression, typeChecker: ts.TypeChecker): { nodeId: string } | null {
    let targetExpression: ts.Expression | undefined;
    
    if (ts.isIdentifier(node.expression)) {
      targetExpression = node.expression;
    } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
      targetExpression = node.expression.name;
    }
    
    if (!targetExpression) {
      return null;
    }
    
    // Use TypeScript's symbol resolution to find the actual declaration
    const symbol = typeChecker.getSymbolAtLocation(targetExpression);
    if (!symbol) {
      return null;
    }
    
    // Handle imported symbols by following the alias to the actual declaration
    let actualSymbol = symbol;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      const aliasedSymbol = typeChecker.getAliasedSymbol(symbol);
      if (aliasedSymbol && aliasedSymbol.declarations && aliasedSymbol.declarations.length > 0) {
        actualSymbol = aliasedSymbol;
      }
    }
    
    if (!actualSymbol || !actualSymbol.declarations || actualSymbol.declarations.length === 0) {
      return null;
    }
    
    const declaration = actualSymbol.declarations[0];
    if (!declaration) {
      return null;
    }
    
    // Get the source file of the declaration
    const sourceFile = declaration.getSourceFile();
    const fileName = path.relative(process.cwd(), sourceFile.fileName);
    
    // Determine the function/method name and class context
    let functionName: string | undefined;
    let className: string | undefined;
    
    if (ts.isFunctionDeclaration(declaration) && declaration.name) {
      functionName = declaration.name.text;
    } else if (ts.isMethodDeclaration(declaration) && declaration.name && ts.isIdentifier(declaration.name)) {
      functionName = declaration.name.text;
      // Find the containing class
      let parent: ts.Node | undefined = declaration.parent;
      while (parent && !ts.isClassDeclaration(parent)) {
        parent = parent.parent;
      }
      if (parent && ts.isClassDeclaration(parent) && parent.name) {
        className = parent.name.text;
      }
    } else if (ts.isImportSpecifier(declaration)) {
      // For imported functions, use the imported name and search in our call graph
      functionName = declaration.name?.text || (ts.isIdentifier(targetExpression) ? targetExpression.text : undefined);
      if (functionName) {
        // Find the function in our call graph by name
        for (const [nodeId, node] of this.graph.nodes) {
          if (node.name === functionName && node.type === 'function') {
            return { nodeId };
          }
        }
      }
      return null;
    }
    
    if (!functionName) {
      return null;
    }
    
    // Create the node ID using the same logic as in analyzeFile
    const nodeId = this.createNodeId(fileName, functionName, className);
    
    // Verify the node exists in our graph
    if (this.graph.nodes.has(nodeId)) {
      return { nodeId };
    }
    
    return null;
  }

  private findCallsInFile(sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker) {
    const fileName = path.relative(process.cwd(), sourceFile.fileName);
    
    const visit = (node: ts.Node, currentFunction?: string, currentClass?: string) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const functionName = node.name.text;
        // Visit the function body with this function as the current context
        ts.forEachChild(node, child => visit(child, functionName, currentClass));
        return;
      }
      
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const methodName = node.name.text;
        // Visit the method body with this method as the current context
        ts.forEachChild(node, child => visit(child, methodName, currentClass));
        return;
      }
      
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        // Visit class members with the class context
        ts.forEachChild(node, child => visit(child, currentFunction, className));
        return;
      }
      
      if (ts.isCallExpression(node) && currentFunction) {
        const callTarget = this.resolveCallTarget(node, typeChecker);
        if (callTarget) {
          const fromNodeId = this.findNodeByNameWithContext(currentFunction, fileName, currentClass);
          
          if (fromNodeId) {
            // Check if the call has parameters (sends data)
            const sendsData = node.arguments && node.arguments.length > 0;
            
            // Check if the return value is used in an expression (returns data)
            const returnsData = this.isReturnValueUsed(node);
            
            this.graph.edges.push({ 
              from: fromNodeId, 
              to: callTarget.nodeId, 
              type: 'function_call',
              sendsData,
              returnsData
            });
          }
        }
      }

      // Handle constructor calls (new ClassName())
      if (ts.isNewExpression(node) && currentFunction) {
        if (ts.isIdentifier(node.expression)) {
          const className = node.expression.text;
          const fromNodeId = this.findNodeByNameWithContext(currentFunction, fileName, currentClass);
          
          if (fromNodeId) {
            // Find the class node to use as the edge target
            const classId = `${fileName}::${className}`;
            const classNode = this.graph.nodes.get(classId);
            if (classNode) {
              // Check if the constructor call has parameters (sends data)
              const sendsData = node.arguments && node.arguments.length > 0;
              
              // Check if the return value (new instance) is used (returns data)
              const returnsData = this.isReturnValueUsed(node as any);
              
              this.graph.edges.push({ 
                from: fromNodeId, 
                to: classId,
                type: 'instantiation',
                sendsData,
                returnsData
              });
            }
          }
        }
      }
      
      ts.forEachChild(node, child => visit(child, currentFunction, currentClass));
    };

    visit(sourceFile);
  }

  private createNodeId(file: string, name: string, className?: string): string {
    return className ? `${file}::${className}::${name}` : `${file}::${name}`;
  }

  private findNodeByName(name: string, fileName: string): string | null {
    // First try to find in the same file
    for (const [nodeId, node] of this.graph.nodes) {
      if (node.name === name && node.metadata?.file === fileName) {
        return nodeId;
      }
    }
    
    // If not found in the same file, search across all files
    for (const [nodeId, node] of this.graph.nodes) {
      if (node.name === name) {
        return nodeId;
      }
    }
    
    return null;
  }

  private findNodeByNameWithContext(name: string, fileName: string, className?: string): string | null {
    // Create the expected node ID based on context
    const expectedNodeId = this.createNodeId(fileName, name, className);
    
    // Check if this exact node exists
    if (this.graph.nodes.has(expectedNodeId)) {
      return expectedNodeId;
    }
    
    // Fallback to original behavior for backwards compatibility
    return this.findNodeByName(name, fileName);
  }

  /**
   * Determines if a call expression's return value is used in any way.
   * This includes assignment, being part of a larger expression, or being returned.
   */
  private isReturnValueUsed(callNode: ts.CallExpression): boolean {
    const parent = callNode.parent;
    
    if (!parent) {
      return false;
    }
    
    // Check if the call is used in various expression contexts
    return (
      // Variable assignment: const x = foo()
      ts.isVariableDeclaration(parent) ||
      // Property assignment: obj.prop = foo()
      ts.isBinaryExpression(parent) ||
      // Return statement: return foo()
      ts.isReturnStatement(parent) ||
      // Function argument: bar(foo())
      ts.isCallExpression(parent) ||
      // Array element: [foo()]
      ts.isArrayLiteralExpression(parent) ||
      // Object property: {prop: foo()}
      ts.isPropertyAssignment(parent) ||
      // Template literal: `${foo()}`
      ts.isTemplateSpan(parent) ||
      // Conditional expression: condition ? foo() : bar
      ts.isConditionalExpression(parent) ||
      // Property access: foo().prop
      ts.isPropertyAccessExpression(parent) ||
      // Element access: foo()[0]
      ts.isElementAccessExpression(parent) ||
      // Spread operator: ...foo()
      ts.isSpreadElement(parent) ||
      // If statement condition: if (foo())
      ts.isIfStatement(parent) ||
      // While loop condition: while (foo())
      ts.isWhileStatement(parent) ||
      // For loop condition: for (...; foo(); ...)
      ts.isForStatement(parent) ||
      // Switch statement: switch (foo())
      ts.isSwitchStatement(parent) ||
      // Parenthesized expression: (foo())
      ts.isParenthesizedExpression(parent)
    );
  }

}