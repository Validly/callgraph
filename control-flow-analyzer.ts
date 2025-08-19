import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import type { Graph, Node, Edge } from './types.js';

export interface ControlFlowOptions {
  functionName: string;
  filePath?: string;
}

export class ControlFlowAnalyzer {
  private nodeCounter = 0;

  analyze(projectPath: string, options: ControlFlowOptions): Graph {
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

    // Find the target function
    const targetFunction = this.findFunction(program, options);
    if (!targetFunction) {
      throw new Error(`Function "${options.functionName}" not found${options.filePath ? ` in ${options.filePath}` : ''}`);
    }

    // Analyze control flow
    return this.analyzeControlFlow(targetFunction.node, targetFunction.sourceFile, program);
  }

  private findTsFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        files.push(...this.findTsFiles(fullPath));
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.js') || item.endsWith('.jsx'))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private findFunction(program: ts.Program, options: ControlFlowOptions): { node: ts.Node, sourceFile: ts.SourceFile } | null {
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) {
        continue;
      }

      // If specific file path is provided, only search in that file
      if (options.filePath && !sourceFile.fileName.includes(options.filePath)) {
        continue;
      }

      const result = this.findFunctionInFile(sourceFile, options.functionName);
      if (result) {
        return { node: result, sourceFile };
      }
    }

    return null;
  }

  private findFunctionInFile(sourceFile: ts.SourceFile, functionName: string): ts.Node | null {
    let foundFunction: ts.Node | null = null;

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        foundFunction = node;
        return;
      }
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        foundFunction = node;
        return;
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        if (node.initializer && (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer))) {
          foundFunction = node.initializer;
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return foundFunction;
  }

  private analyzeControlFlow(functionNode: ts.Node, sourceFile: ts.SourceFile, program: ts.Program): Graph {
    const nodes = new Map<string, Node>();
    const edges: Edge[] = [];
    this.nodeCounter = 0;

    // Create entry node
    const entryId = this.getNextNodeId();
    const entryNode: Node = {
      id: entryId,
      name: 'START',
      type: 'start'
    };
    nodes.set(entryId, entryNode);

    // Create exit node
    const exitId = this.getNextNodeId();
    const exitNode: Node = {
      id: exitId,
      name: 'END',
      type: 'end'
    };
    nodes.set(exitId, exitNode);

    // Get function body
    let functionBody: ts.Node | undefined;
    if (ts.isFunctionDeclaration(functionNode) || ts.isFunctionExpression(functionNode) || ts.isMethodDeclaration(functionNode)) {
      functionBody = functionNode.body;
    } else if (ts.isArrowFunction(functionNode)) {
      functionBody = ts.isBlock(functionNode.body) ? functionNode.body : functionNode.body;
    }

    if (!functionBody) {
      // No body, just connect start to end
      edges.push({ from: entryId, to: exitId, type: 'sequence' });
      return { nodes, edges };
    }

    // Analyze the function body
    const bodyExitNodes = this.analyzeStatement(functionBody, entryId, exitId, nodes, edges, sourceFile, program);
    
    // Connect any dangling nodes to exit
    for (const exitNodeId of bodyExitNodes) {
      if (exitNodeId !== exitId) {
        edges.push({ from: exitNodeId, to: exitId, type: 'sequence' });
      }
    }

    return { nodes, edges };
  }

  private analyzeStatement(statement: ts.Node, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    if (ts.isBlock(statement)) {
      return this.analyzeBlock(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    if (ts.isIfStatement(statement)) {
      return this.analyzeIfStatement(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    if (ts.isWhileStatement(statement) || ts.isDoStatement(statement)) {
      return this.analyzeWhileStatement(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    if (ts.isForStatement(statement) || ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
      return this.analyzeForStatement(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    if (ts.isSwitchStatement(statement)) {
      return this.analyzeSwitchStatement(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    if (ts.isReturnStatement(statement)) {
      const returnNodeId = this.getNextNodeId();
      const returnNode: Node = {
        id: returnNodeId,
        name: 'return' + (statement.expression ? ` ${statement.expression.getText(sourceFile)}` : ''),
        type: 'return'
      };
      nodes.set(returnNodeId, returnNode);
      edges.push({ from: entryNodeId, to: returnNodeId, type: 'sequence' });
      edges.push({ from: returnNodeId, to: exitNodeId, type: 'sequence' });
      return [];
    }

    if (ts.isThrowStatement(statement)) {
      const throwNodeId = this.getNextNodeId();
      const throwNode: Node = {
        id: throwNodeId,
        name: `throw ${statement.expression?.getText(sourceFile) || ''}`,
        type: 'throw'
      };
      nodes.set(throwNodeId, throwNode);
      edges.push({ from: entryNodeId, to: throwNodeId, type: 'sequence' });
      return [];
    }

    if (ts.isTryStatement(statement)) {
      return this.analyzeTryStatement(statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    }

    // Regular statement (assignment, expression, etc.)
    const statementNodeId = this.getNextNodeId();
    let statementText = statement.getText(sourceFile).trim();
    
    // Check if this is a function call
    const calls = this.extractFunctionCalls(statement, sourceFile, program);
    if (calls.length > 0) {
      // This is a function call - represent it specially
      const callText = calls.map(call => call.name).join(', ');
      const statementNode: Node = {
        id: statementNodeId,
        name: callText,
        type: 'function_call',
        metadata: { calls, originalText: statementText }
      };
      nodes.set(statementNodeId, statementNode);
    } else {
      // Regular statement
      if (statementText.length > 50) {
        statementText = statementText.substring(0, 47) + '...';
      }
      const statementNode: Node = {
        id: statementNodeId,
        name: statementText,
        type: 'statement'
      };
      nodes.set(statementNodeId, statementNode);
    }

    edges.push({ from: entryNodeId, to: statementNodeId, type: 'sequence' });
    return [statementNodeId];
  }

  private analyzeBlock(block: ts.Block, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    if (block.statements.length === 0) {
      return [entryNodeId];
    }

    let currentNodes = [entryNodeId];
    
    for (const statement of block.statements) {
      // For control flow statements that can create multiple exit paths, handle them normally
      if (ts.isIfStatement(statement) || ts.isWhileStatement(statement) || ts.isDoStatement(statement) || 
          ts.isForStatement(statement) || ts.isForInStatement(statement) || ts.isForOfStatement(statement) ||
          ts.isSwitchStatement(statement) || ts.isTryStatement(statement) || ts.isReturnStatement(statement) ||
          ts.isThrowStatement(statement) || ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) {
        
        const nextNodes: string[] = [];
        for (const currentNode of currentNodes) {
          const statementExitNodes = this.analyzeStatement(statement, currentNode, exitNodeId, nodes, edges, sourceFile, program);
          nextNodes.push(...statementExitNodes);
        }
        currentNodes = nextNodes.length > 0 ? nextNodes : [];
        
        // If we have no current nodes, we can't continue analyzing the rest of the block
        // This happens when all paths terminate (return/throw statements)
        if (currentNodes.length === 0) {
          break;
        }
        
      } else {
        // For other control flow statements and simple statements, analyze them from each path
        const nextNodes: string[] = [];
        for (const currentNode of currentNodes) {
          const statementExitNodes = this.analyzeStatement(statement, currentNode, exitNodeId, nodes, edges, sourceFile, program);
          nextNodes.push(...statementExitNodes);
        }
        
        currentNodes = nextNodes.length > 0 ? nextNodes : [];
        
        // If we have no current nodes, we can't continue analyzing the rest of the block
        if (currentNodes.length === 0) {
          break;
        }
      }
    }

    return currentNodes;
  }

  private analyzeIfStatement(ifStmt: ts.IfStatement, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    const conditionNodeId = this.getNextNodeId();
    const conditionNode: Node = {
      id: conditionNodeId,
      name: ifStmt.expression.getText(sourceFile),
      type: 'condition'
    };
    nodes.set(conditionNodeId, conditionNode);
    edges.push({ from: entryNodeId, to: conditionNodeId, type: 'sequence' });

    const exitNodes: string[] = [];

    // Then branch - mark the edge from condition to then branch as 'true'
    const edgeCountBeforeThen = edges.length;
    const thenExitNodes = this.analyzeStatement(ifStmt.thenStatement, conditionNodeId, exitNodeId, nodes, edges, sourceFile, program);
    // Find the edge from condition that was just added and mark it as 'true'
    for (let i = edgeCountBeforeThen; i < edges.length; i++) {
      if (edges[i].from === conditionNodeId) {
        edges[i].type = 'true';
        break;
      }
    }
    exitNodes.push(...thenExitNodes);

    // Else branch
    if (ifStmt.elseStatement) {
      const edgeCountBeforeElse = edges.length;
      const elseExitNodes = this.analyzeStatement(ifStmt.elseStatement, conditionNodeId, exitNodeId, nodes, edges, sourceFile, program);
      // Find the edge from condition that was just added and mark it as 'false'
      for (let i = edgeCountBeforeElse; i < edges.length; i++) {
        if (edges[i].from === conditionNodeId) {
          edges[i].type = 'false';
          break;
        }
      }
      exitNodes.push(...elseExitNodes);
    } else {
      // No else branch - condition can take false path to continue
      // Return the condition node so the false edge can be connected later
      exitNodes.push(conditionNodeId);
    }

    return exitNodes;
  }

  private analyzeWhileStatement(whileStmt: ts.WhileStatement | ts.DoStatement, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    const conditionNodeId = this.getNextNodeId();
    const conditionNode: Node = {
      id: conditionNodeId,
      name: (whileStmt as any).expression.getText(sourceFile),
      type: 'condition'
    };
    nodes.set(conditionNodeId, conditionNode);

    if (ts.isDoStatement(whileStmt)) {
      // do-while: entry -> body -> condition -> (back to body or exit)
      const bodyExitNodes = this.analyzeStatement(whileStmt.statement, entryNodeId, exitNodeId, nodes, edges, sourceFile, program);
      for (const bodyExitNode of bodyExitNodes) {
        edges.push({ from: bodyExitNode, to: conditionNodeId, type: 'sequence' });
      }
      edges.push({ from: conditionNodeId, to: entryNodeId, type: 'true' }); // Back to start of body
      return [conditionNodeId]; // False condition exits
    } else {
      // while: entry -> condition -> body -> (back to condition or exit)
      edges.push({ from: entryNodeId, to: conditionNodeId, type: 'sequence' });
      const bodyExitNodes = this.analyzeStatement(whileStmt.statement, conditionNodeId, exitNodeId, nodes, edges, sourceFile, program);
      edges[edges.length - 1].type = 'true'; // Condition true goes to body
      
      for (const bodyExitNode of bodyExitNodes) {
        edges.push({ from: bodyExitNode, to: conditionNodeId, type: 'loop_back' });
      }
      
      return [conditionNodeId]; // False condition exits
    }
  }

  private analyzeForStatement(forStmt: ts.ForStatement | ts.ForInStatement | ts.ForOfStatement, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    const loopNodeId = this.getNextNodeId();
    let loopText = '';
    
    if (ts.isForStatement(forStmt)) {
      const init = forStmt.initializer?.getText(sourceFile) || '';
      const condition = forStmt.condition?.getText(sourceFile) || 'true';
      const increment = forStmt.incrementor?.getText(sourceFile) || '';
      loopText = `for (${init}; ${condition}; ${increment})`;
    } else if (ts.isForInStatement(forStmt)) {
      loopText = `for (${forStmt.initializer.getText(sourceFile)} in ${forStmt.expression.getText(sourceFile)})`;
    } else {
      loopText = `for (${forStmt.initializer.getText(sourceFile)} of ${forStmt.expression.getText(sourceFile)})`;
    }
    
    const loopNode: Node = {
      id: loopNodeId,
      name: loopText,
      type: 'loop'
    };
    nodes.set(loopNodeId, loopNode);
    edges.push({ from: entryNodeId, to: loopNodeId, type: 'sequence' });

    // Analyze loop body
    const bodyExitNodes = this.analyzeStatement(forStmt.statement, loopNodeId, exitNodeId, nodes, edges, sourceFile, program);
    edges[edges.length - 1].type = 'loop_body';

    // Loop back
    for (const bodyExitNode of bodyExitNodes) {
      edges.push({ from: bodyExitNode, to: loopNodeId, type: 'loop_back' });
    }

    return [loopNodeId]; // Loop can exit
  }

  private analyzeSwitchStatement(switchStmt: ts.SwitchStatement, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    const switchText = `switch (${switchStmt.expression.getText(sourceFile)})`;
    
    // Check if we already have a switch node with this exact expression
    let switchNodeId: string | undefined;
    for (const [nodeId, node] of nodes) {
      if (node.type === 'switch' && node.name === switchText) {
        switchNodeId = nodeId;
        break;
      }
    }
    
    if (switchNodeId) {
      // Use existing switch node, just add the edge if it doesn't exist
      const existingEdge = edges.find(e => e.from === entryNodeId && e.to === switchNodeId);
      if (!existingEdge) {
        // Check if this is a false edge from a condition
        const existingEdges = edges.filter(e => e.from === entryNodeId);
        const isConditionWithoutElse = existingEdges.some(e => e.type === 'true') && !existingEdges.some(e => e.type === 'false');
        const entryNodeObj = nodes.get(entryNodeId);
        const edgeType = (isConditionWithoutElse && entryNodeObj?.type === 'condition') ? 'false' : 'sequence';
        edges.push({ from: entryNodeId, to: switchNodeId, type: edgeType });
      }
      
      // Return the existing exit nodes for this switch
      const exitNodes = edges.filter(e => e.from !== switchNodeId && e.to === exitNodeId).map(e => e.from);
      return exitNodes.length > 0 ? exitNodes : [switchNodeId];
    }
    
    // Create new switch node
    switchNodeId = this.getNextNodeId();
    const switchNode: Node = {
      id: switchNodeId,
      name: switchText,
      type: 'switch'
    };
    nodes.set(switchNodeId, switchNode);
    
    // Check if this is a false edge from a condition
    const existingEdges = edges.filter(e => e.from === entryNodeId);
    const isConditionWithoutElse = existingEdges.some(e => e.type === 'true') && !existingEdges.some(e => e.type === 'false');
    const entryNodeObj = nodes.get(entryNodeId);
    const edgeType = (isConditionWithoutElse && entryNodeObj?.type === 'condition') ? 'false' : 'sequence';
    edges.push({ from: entryNodeId, to: switchNodeId, type: edgeType });

    const exitNodes: string[] = [];
    let hasFallthrough = false;

    for (const clause of switchStmt.caseBlock.clauses) {
      const caseNodeId = this.getNextNodeId();
      let caseName = '';
      
      if (ts.isCaseClause(clause)) {
        caseName = `case ${clause.expression.getText(sourceFile)}`;
      } else {
        caseName = 'default';
      }
      
      const caseNode: Node = {
        id: caseNodeId,
        name: caseName,
        type: 'case'
      };
      nodes.set(caseNodeId, caseNode);
      edges.push({ from: switchNodeId, to: caseNodeId, type: 'case' });

      if (clause.statements.length > 0) {
        let currentNodes = [caseNodeId];
        
        for (const statement of clause.statements) {
          const nextNodes: string[] = [];
          
          for (const currentNode of currentNodes) {
            const statementExitNodes = this.analyzeStatement(statement, currentNode, exitNodeId, nodes, edges, sourceFile, program);
            nextNodes.push(...statementExitNodes);
          }
          
          currentNodes = nextNodes.length > 0 ? nextNodes : [caseNodeId];
          
          // Check if this is a break statement
          if (ts.isBreakStatement(statement)) {
            hasFallthrough = false;
            break;
          }
        }
        
        exitNodes.push(...currentNodes);
      } else {
        exitNodes.push(caseNodeId);
      }
    }

    return exitNodes;
  }

  private analyzeTryStatement(tryStmt: ts.TryStatement, entryNodeId: string, exitNodeId: string, nodes: Map<string, Node>, edges: Edge[], sourceFile: ts.SourceFile, program: ts.Program): string[] {
    const tryNodeId = this.getNextNodeId();
    const tryNode: Node = {
      id: tryNodeId,
      name: 'try',
      type: 'try'
    };
    nodes.set(tryNodeId, tryNode);
    edges.push({ from: entryNodeId, to: tryNodeId, type: 'sequence' });

    const exitNodes: string[] = [];

    // Try block
    const tryExitNodes = this.analyzeStatement(tryStmt.tryBlock, tryNodeId, exitNodeId, nodes, edges, sourceFile, program);
    exitNodes.push(...tryExitNodes);

    // Catch block
    if (tryStmt.catchClause) {
      const catchNodeId = this.getNextNodeId();
      const catchParam = tryStmt.catchClause.variableDeclaration?.name.getText(sourceFile) || 'e';
      const catchNode: Node = {
        id: catchNodeId,
        name: `catch (${catchParam})`,
        type: 'catch'
      };
      nodes.set(catchNodeId, catchNode);
      edges.push({ from: tryNodeId, to: catchNodeId, type: 'exception' });

      const catchExitNodes = this.analyzeStatement(tryStmt.catchClause.block, catchNodeId, exitNodeId, nodes, edges, sourceFile, program);
      exitNodes.push(...catchExitNodes);
    }

    // Finally block
    if (tryStmt.finallyBlock) {
      const finallyNodeId = this.getNextNodeId();
      const finallyNode: Node = {
        id: finallyNodeId,
        name: 'finally',
        type: 'finally'
      };
      nodes.set(finallyNodeId, finallyNode);

      // Finally connects to all exit nodes from try/catch
      for (const exitNode of exitNodes) {
        edges.push({ from: exitNode, to: finallyNodeId, type: 'finally' });
      }

      const finallyExitNodes = this.analyzeStatement(tryStmt.finallyBlock, finallyNodeId, exitNodeId, nodes, edges, sourceFile, program);
      return finallyExitNodes;
    }

    return exitNodes;
  }

  private extractFunctionCalls(node: ts.Node, sourceFile: ts.SourceFile, program: ts.Program): { name: string, external: boolean }[] {
    const calls: { name: string, external: boolean }[] = [];
    const typeChecker = program.getTypeChecker();

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        let callName = '';
        let isExternal = true;

        if (ts.isIdentifier(node.expression)) {
          callName = node.expression.text;
          // Check if it's a local function
          const symbol = typeChecker.getSymbolAtLocation(node.expression);
          if (symbol && symbol.valueDeclaration) {
            const sourceFile = symbol.valueDeclaration.getSourceFile();
            isExternal = sourceFile.fileName.includes('node_modules');
          }
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          callName = node.expression.getText(sourceFile);
        } else {
          callName = node.expression.getText(sourceFile);
        }

        calls.push({ name: callName, external: isExternal });
      }

      ts.forEachChild(node, visit);
    };

    visit(node);
    return calls;
  }

  private getNextNodeId(): string {
    return `cf_${this.nodeCounter++}`;
  }
}