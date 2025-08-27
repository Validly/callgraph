#!/usr/bin/env bun

import prompts from 'prompts';
import * as path from 'path';
import * as fs from 'fs';
import { TypeScriptFunctionCallAnalyzer } from './function-call-analyzer.js';
import type { Graph } from './types.js';
import { MiroCallGraphGenerator } from './miro.js';
import { GraphDiagramGenerator } from './graph-diagram.js';
import { graphOps } from './graph-operations.js';
import { GraphvizRenderer } from './svg-generator.js';
import { LLMVibeAnalyzer } from './llm-vibe-analyzer.js';
import { HybridAnalyzer } from './hybrid-analyzer.js';
import { ControlFlowAnalyzer } from './control-flow-analyzer.js';
import { ControlFlowDiagramGenerator } from './control-flow-diagram.js';
import { llmCache } from './llm-cache.js';

/**
 * Apply nested clustering to a hybrid graph:
 * For each domain cluster, group functions by their original file/class
 * and create nested sub-clusters where multiple functions from the same class exist
 */
function applyNestedClustering(hybridGraph: Graph): Graph {
  const nestedGraph: Graph = {
    nodes: new Map(),
    edges: [...hybridGraph.edges] // Keep edges as-is initially
  };

  // Find all domain clusters (top-level nodes with type 'file' from hybrid analysis)  
  const domainClusters = Array.from(hybridGraph.nodes.values())
    .filter(node => !node.parent && node.type === 'file' && node.metadata?.isCluster);
  
  console.log(`🔍 Processing ${domainClusters.length} domain clusters for nested structure...`);
  
  for (const domainCluster of domainClusters) {
    // Copy the domain cluster to the new graph
    const newDomainCluster = {
      ...domainCluster,
      children: new Map()
    };
    nestedGraph.nodes.set(domainCluster.id, newDomainCluster);
    
    // Get all function nodes in this domain cluster
    const functionsInDomain = Array.from(hybridGraph.nodes.values())
      .filter(node => node.parent === domainCluster.id);
    
    // Group functions by their original file and class
    const fileClassGroups = new Map<string, Array<any>>();
    
    for (const func of functionsInDomain) {
      const file = func.metadata?.file || 'unknown';
      const className = func.metadata?.className;
      
      const groupKey = className ? `${file}::${className}` : file;
      
      if (!fileClassGroups.has(groupKey)) {
        fileClassGroups.set(groupKey, []);
      }
      fileClassGroups.get(groupKey)!.push(func);
    }
    
    // Create nested structure
    for (const [groupKey, funcs] of fileClassGroups) {
      const [file, className] = groupKey.split('::');
      
      if (funcs.length === 1 && !className) {
        // Single standalone function - keep it directly under domain
        const func = funcs[0];
        const newFunc = {
          ...func,
          parent: domainCluster.id
        };
        nestedGraph.nodes.set(func.id, newFunc);
        newDomainCluster.children!.set(func.id, newFunc);
        
      } else if (funcs.length > 1 || className) {
        // Multiple functions or class functions - create intermediate cluster
        
        // Create file cluster if multiple functions from same file
        let intermediateParent = domainCluster.id;
        let intermediateParentNode = newDomainCluster;
        
        if (funcs.some(f => f.metadata?.file === file) && 
            fileClassGroups.size > 1) {
          // Create file-level cluster
          const fileClusterId = `${domainCluster.id}::${file}`;
          const fileName = file ? file.split('/').pop() || file : 'unknown';
          const fileCluster = {
            id: fileClusterId,
            name: fileName,
            type: 'file' as const,
            metadata: { 
              isFileCluster: true, 
              filePath: file,
              domain: domainCluster.metadata?.domain 
            },
            children: new Map(),
            parent: domainCluster.id
          };
          
          nestedGraph.nodes.set(fileClusterId, fileCluster);
          newDomainCluster.children!.set(fileClusterId, fileCluster);
          intermediateParent = fileClusterId;
          intermediateParentNode = fileCluster;
        }
        
        if (className && funcs.length > 1) {
          // Create class cluster
          const classClusterId = `${intermediateParent}::${className}`;
          const classCluster = {
            id: classClusterId,
            name: className,
            type: 'class' as const,
            metadata: { 
              isClassCluster: true, 
              className,
              file,
              domain: domainCluster.metadata?.domain 
            },
            children: new Map(),
            parent: intermediateParent
          };
          
          nestedGraph.nodes.set(classClusterId, classCluster);
          intermediateParentNode.children!.set(classClusterId, classCluster);
          
          // Add functions to class cluster
          for (const func of funcs) {
            const newFunc = {
              ...func,
              parent: classClusterId
            };
            nestedGraph.nodes.set(func.id, newFunc);
            classCluster.children!.set(func.id, newFunc);
          }
        } else {
          // Add functions directly to intermediate parent
          for (const func of funcs) {
            const newFunc = {
              ...func,
              parent: intermediateParent
            };
            nestedGraph.nodes.set(func.id, newFunc);
            intermediateParentNode.children!.set(func.id, newFunc);
          }
        }
      }
    }
  }
  
  // Copy any remaining nodes that weren't in domain clusters
  for (const [nodeId, node] of hybridGraph.nodes) {
    if (!nestedGraph.nodes.has(nodeId)) {
      nestedGraph.nodes.set(nodeId, { ...node });
    }
  }
  
  return nestedGraph;
}

async function main() {
  console.log('🔗 TypeScript Call Graph Generator');
  console.log('===================================\n');

  let projectPath: string;
  let outputToMiro = false;
  let useHighLevel = false;
  let highLevelClusters: string[] = []; // Specific clusters to collapse
  let generateSVGFiles = false;
  let showHelp = false;
  let useLLMVibe = false;
  let useHybrid = false;
  let useNestedHybrid = false;
  let useControlFlow = false;
  let controlFlowFunction: string | undefined;
  let controlFlowFile: string | undefined;
  let promptTemplate = 'callgraph-basic';
  let customPrompt: string | undefined;
  let promptSuffix: string | undefined;
  let cacheStats = false;
  let cacheClear = false;
  let cacheDisable = false;

  // Parse command line arguments
  const args = process.argv.slice(2);
  const miroIndex = args.indexOf('--miro');
  if (miroIndex !== -1) {
    outputToMiro = true;
    args.splice(miroIndex, 1); // Remove --miro flag from args
  }
  
  // Parse --highlevel flag with optional cluster specification
  const highLevelIndex = args.findIndex(arg => arg.startsWith('--highlevel'));
  if (highLevelIndex !== -1) {
    useHighLevel = true;
    const highLevelArg = args[highLevelIndex];
    
    if (highLevelArg.includes('=')) {
      // Parse cluster specification: --highlevel=cluster1,cluster2 or --highlevel=all,-cluster1
      const clusterSpec = highLevelArg.split('=')[1];
      highLevelClusters = clusterSpec.split(',').map(c => c.trim());
    }
    
    args.splice(highLevelIndex, 1); // Remove --highlevel flag from args
  }

  const svgIndex = args.indexOf('--svg');
  if (svgIndex !== -1) {
    generateSVGFiles = true;
    args.splice(svgIndex, 1); // Remove --svg flag from args
  }

  const llmVibeIndex = args.indexOf('--llm-vibe');
  if (llmVibeIndex !== -1) {
    useLLMVibe = true;
    args.splice(llmVibeIndex, 1); // Remove --llm-vibe flag from args
  }

  const hybridIndex = args.indexOf('--hybrid');
  if (hybridIndex !== -1) {
    useHybrid = true;
    args.splice(hybridIndex, 1); // Remove --hybrid flag from args
  }

  const nestedHybridIndex = args.indexOf('--nested-hybrid');
  if (nestedHybridIndex !== -1) {
    useNestedHybrid = true;
    args.splice(nestedHybridIndex, 1); // Remove --nested-hybrid flag from args
  }

  const templateIndex = args.findIndex(arg => arg.startsWith('--template='));
  if (templateIndex !== -1) {
    promptTemplate = args[templateIndex]?.split('=')[1] || 'callgraph-basic';
    args.splice(templateIndex, 1); // Remove --template flag from args
  }

  const promptIndex = args.findIndex(arg => arg.startsWith('--prompt='));
  if (promptIndex !== -1) {
    customPrompt = args[promptIndex]?.split('=')[1];
    args.splice(promptIndex, 1); // Remove --prompt flag from args
  }

  const promptSuffixIndex = args.findIndex(arg => arg.startsWith('--prompt-suffix='));
  if (promptSuffixIndex !== -1) {
    promptSuffix = args[promptSuffixIndex]?.split('=')[1];
    args.splice(promptSuffixIndex, 1); // Remove --prompt-suffix flag from args
  }

  const controlFlowIndex = args.findIndex(arg => arg.startsWith('--controlflow='));
  if (controlFlowIndex !== -1) {
    useControlFlow = true;
    const controlFlowArg = args[controlFlowIndex]?.split('=')[1];
    if (controlFlowArg?.includes(':')) {
      const [file, func] = controlFlowArg.split(':');
      controlFlowFile = file;
      controlFlowFunction = func;
    } else {
      controlFlowFunction = controlFlowArg;
    }
    args.splice(controlFlowIndex, 1); // Remove --controlflow flag from args
  }

  const cacheStatsIndex = args.indexOf('--cache-stats');
  if (cacheStatsIndex !== -1) {
    cacheStats = true;
    args.splice(cacheStatsIndex, 1);
  }

  const cacheClearIndex = args.indexOf('--cache-clear');
  if (cacheClearIndex !== -1) {
    cacheClear = true;
    args.splice(cacheClearIndex, 1);
  }

  const cacheDisableIndex = args.indexOf('--cache-disable');
  if (cacheDisableIndex !== -1) {
    cacheDisable = true;
    args.splice(cacheDisableIndex, 1);
  }

  const helpIndex = args.findIndex(arg => arg === '--help' || arg === '-h');
  if (helpIndex !== -1) {
    showHelp = true;
  }

  // Check for conflicting flags
  const analysisFlags = [useLLMVibe, useHybrid, useNestedHybrid, useControlFlow].filter(Boolean).length;
  if (analysisFlags > 1) {
    console.error('❌ Error: Cannot use multiple analysis methods together. Please choose one: --llm-vibe, --hybrid, --nested-hybrid, or --controlflow.');
    process.exit(1);
  }
  
  if (useControlFlow && !controlFlowFunction) {
    console.error('❌ Error: --controlflow requires a function name. Use --controlflow=functionName or --controlflow=file:functionName');
    process.exit(1);
  }

  if (showHelp) {
    console.log(`
📊 TypeScript Call Graph Generator

Usage:
  bun run index.ts [path] [options]

Arguments:
  path                    Path to TypeScript project (default: interactive prompt)

Options:
  --svg                   Generate SVG files from DOT files
  --highlevel[=SPEC]      Generate high-level view with optional cluster selection:
                         --highlevel (collapse all clusters)
                         --highlevel=cluster1,cluster2 (collapse only specified clusters)
                         --highlevel=all,-cluster1 (collapse all except cluster1)
                         --highlevel=cluster1:2 (expand cluster1 to depth 2)
                         --highlevel=all:1,-cluster1:3 (expand all to depth 1, cluster1 to depth 3)
  --miro                  Output call graph to Miro board
  --llm-vibe              Use LLM-based analysis instead of AST parsing
  --hybrid                Use hybrid analysis (AST edges + LLM domain clustering)
  --nested-hybrid         Use nested hybrid analysis (domain + file/class clusters)
  --controlflow=FUNC      Generate control flow diagram for a specific function
                         Use --controlflow=functionName or --controlflow=file:functionName
  --template=NAME         Prompt template for LLM/hybrid analysis (default: callgraph-basic)
  --prompt="TEXT"         Custom prompt for LLM/hybrid analysis
  --prompt-suffix="TEXT"  Additional text to append to the prompt
  --cache-stats           Show LLM cache statistics and exit
  --cache-clear           Clear all LLM cache entries and exit
  --cache-disable         Disable LLM caching for this run
  --help, -h              Show this help message

LLM Templates:
  callgraph-basic         Basic call graph generation (default)
  callgraph-detailed      Detailed analysis with metadata
  callgraph-architecture  High-level architectural analysis
  callgraph-debug         Debug-focused analysis

Hybrid Templates:
  hybrid-clustering       Domain-based clustering from call graph (default)
  hybrid-clustering-detailed  Detailed architectural clustering

Examples:
  bun run index.ts                    # Interactive mode, AST analysis
  bun run index.ts .                  # Analyze current directory with AST
  bun run index.ts . --llm-vibe       # Use LLM analysis with basic template
  bun run index.ts . --hybrid         # Use hybrid analysis (AST + LLM clustering)
  bun run index.ts . --hybrid --template=hybrid-clustering-detailed
  bun run index.ts . --llm-vibe --template=callgraph-detailed
  bun run index.ts . --llm-vibe --prompt="Focus on error handling patterns"
  bun run index.ts . --hybrid --prompt-suffix="Focus on security-related functions"
  bun run index.ts . --highlevel --svg # Generate high-level view with SVG
  bun run index.ts . --miro --llm-vibe # LLM analysis + Miro board
  bun run index.ts . --controlflow=myFunction # Control flow for 'myFunction'
  bun run index.ts . --controlflow=utils.ts:helper --svg # Control flow with SVG
`);
    return;
  }

  // Handle cache operations
  if (cacheStats) {
    llmCache.printStats();
    return;
  }

  if (cacheClear) {
    llmCache.clear();
    return;
  }

  if (cacheDisable) {
    llmCache.disable();
  }
  
  if (args.length > 0) {
    projectPath = path.resolve(args[0]!);
  } else {
    // Prompt for directory
    const response = await prompts({
      type: 'text',
      name: 'directory',
      message: 'Enter the path to your TypeScript project:',
      initial: '.',
      validate: (value: string) => {
        const fullPath = path.resolve(value);
        if (!fs.existsSync(fullPath)) {
          return 'Directory does not exist';
        }
        if (!fs.statSync(fullPath).isDirectory()) {
          return 'Path is not a directory';
        }
        return true;
      }
    });

    if (!response.directory) {
      console.log('Operation cancelled.');
      process.exit(0);
    }

    projectPath = path.resolve(response.directory);

    // Ask about Miro output if not specified via command line
    const miroResponse = await prompts({
      type: 'confirm',
      name: 'miro',
      message: 'Output call graph to Miro board?',
      initial: false
    });

    outputToMiro = miroResponse.miro;

    // Ask about high-level view if outputting to Miro
    if (outputToMiro) {
      const highLevelResponse = await prompts({
        type: 'confirm',
        name: 'highlevel',
        message: 'Use high-level view (classes/files only)?',
        initial: false
      });

      useHighLevel = highLevelResponse.highlevel;
    }
  }

  console.log(`\n📁 Analyzing project: ${projectPath}`);
  
  // Determine analysis method
  let analysisMethod: string;
  if (useControlFlow) {
    analysisMethod = `Control Flow Analysis (${controlFlowFunction}${controlFlowFile ? ` in ${controlFlowFile}` : ''})`;
  } else if (useNestedHybrid) {
    analysisMethod = 'Nested Hybrid (AST edges + LLM domains + file/class clusters)';
  } else if (useHybrid) {
    analysisMethod = 'Hybrid (AST edges + LLM domain clustering)';
  } else if (useLLMVibe) {
    analysisMethod = 'LLM-based (vibe analysis)';
  } else {
    analysisMethod = 'AST-based (TypeScript compiler)';
  }
  console.log(`🔧 Analysis method: ${analysisMethod}`);

  try {
    let graph: Graph;
    let hybridSummary: string | undefined;
    let controlFlowGraph: Graph | undefined;
    
    if (useControlFlow) {
      // Use control flow analysis
      const controlFlowAnalyzer = new ControlFlowAnalyzer();
      console.log(`🔍 Analyzing control flow for function: ${controlFlowFunction}...`);
      
      controlFlowGraph = controlFlowAnalyzer.analyze(projectPath, {
        functionName: controlFlowFunction!,
        filePath: controlFlowFile
      });
      
      console.log(`✅ Control flow analysis complete: ${controlFlowGraph.nodes.size} nodes, ${controlFlowGraph.edges.length} edges`);
      
    } else if (useNestedHybrid || useHybrid) {
      // Use hybrid analysis
      const hybridAnalyzer = new HybridAnalyzer();
      
      // Validate environment first
      const validation = await hybridAnalyzer.validateEnvironment();
      if (validation.issues.length > 0) {
        console.error('❌ Environment validation failed:');
        validation.issues.forEach(issue => console.error(`   ${issue}`));
        process.exit(1);
      }

      // Set default template for hybrid analysis
      const hybridTemplate = promptTemplate.startsWith('hybrid-') ? promptTemplate : 'hybrid-clustering';
      console.log(`🔬 Starting hybrid analysis...`);
      if (customPrompt) {
        console.log(`📝 Using custom prompt`);
      } else {
        console.log(`📝 Using template: ${hybridTemplate}`);
      }
      
      const hybridResult = await hybridAnalyzer.analyze(projectPath, {
        templateName: hybridTemplate,
        customPrompt,
        promptSuffix,
        includeSourceContext: hybridTemplate.includes('detailed')
      });
      
      graph = hybridResult.graph;
      hybridSummary = hybridResult.summary;
      
      // Apply nested clustering if requested
      if (useNestedHybrid) {
        console.log(`🔄 Applying nested file/class clustering...`);
        graph = applyNestedClustering(graph);
        console.log(`✅ Nested clustering applied: ${graph.nodes.size} nodes after restructuring`);
      }
      
      // Write hybrid analysis summary to file
      const summaryPath = path.join(projectPath, 'hybrid-analysis-summary.md');
      fs.writeFileSync(summaryPath, hybridSummary);
      console.log(`📋 Hybrid analysis summary saved to: ${summaryPath}`);
      
    } else if (useLLMVibe) {
      // Use LLM-based analysis
      const llmAnalyzer = new LLMVibeAnalyzer();
      
      // Validate environment first
      const validation = await llmAnalyzer.validateEnvironment();
      if (validation.issues.length > 0) {
        console.error('❌ Environment validation failed:');
        validation.issues.forEach(issue => console.error(`   ${issue}`));
        process.exit(1);
      }
      
      console.log('🧠 Starting LLM vibe analysis...');
      if (customPrompt) {
        console.log(`📝 Using custom prompt`);
      } else {
        console.log(`📝 Using template: ${promptTemplate}`);
      }
      
      graph = await llmAnalyzer.analyze(projectPath, {
        templateName: promptTemplate,
        customPrompt
      });
    } else {
      // Use traditional AST-based analysis
      const analyzer = new TypeScriptFunctionCallAnalyzer();
      console.log('🔍 Analyzing TypeScript files...');
      graph = analyzer.analyze(projectPath);
    }

    // Handle different analysis types
    if (useControlFlow && controlFlowGraph) {
      // Control flow analysis - use specialized diagram generator
      const controlFlowDiagramGenerator = new ControlFlowDiagramGenerator();
      console.log('📊 Generating control flow diagram...');
      const dotContent = controlFlowDiagramGenerator.generateDot(controlFlowGraph, controlFlowFunction!);

      // Save control flow diagram to file
      const outputPath = path.join(projectPath, `control-flow-${controlFlowFunction}.dot`);
      controlFlowDiagramGenerator.saveToFile(dotContent, outputPath);
      console.log(`💾 Control flow diagram saved to: ${outputPath}`);
      
      // Generate SVG files if requested
      if (generateSVGFiles) {
        console.log(`\n🎨 Generating SVG files...`);
        const svgRenderer = new GraphvizRenderer();
        const svgPath = path.join(projectPath, `control-flow-${controlFlowFunction}.svg`);
        await svgRenderer.generateSVG(outputPath, svgPath);
      }

      console.log('\n📋 Summary:');
      console.log(`   Function: ${controlFlowFunction}`);
      console.log(`   Control flow nodes: ${controlFlowGraph.nodes.size}`);
      console.log(`   Control flow edges: ${controlFlowGraph.edges.length}`);

      if (!generateSVGFiles) {
        console.log('\n🎨 To generate visual diagram:');
        console.log('   1. Install Graphviz: apt-get install graphviz (or brew install graphviz on macOS)');
        console.log(`   2. Control flow: dot -Tsvg "${outputPath}" -o control-flow-${controlFlowFunction}.svg`);
        console.log('   3. Open the SVG file in your browser');
        console.log('\n   💡 Or use --svg flag to auto-generate SVGs!');
      }

      return;
    }

    console.log(`✅ Found ${graph!.nodes.size} functions/methods and ${graph!.edges.length} calls`);

    // Generate file prefix based on analysis method
    let analysisPrefix: string;
    let templateSuffix = '';
    
    if (useNestedHybrid) {
      analysisPrefix = 'nested-hybrid';
      if (!customPrompt) {
        const hybridTemplate = promptTemplate.startsWith('hybrid-') ? promptTemplate : 'hybrid-clustering';
        templateSuffix = `-${hybridTemplate}`;
      }
    } else if (useHybrid) {
      analysisPrefix = 'hybrid';
      if (!customPrompt) {
        const hybridTemplate = promptTemplate.startsWith('hybrid-') ? promptTemplate : 'hybrid-clustering';
        templateSuffix = `-${hybridTemplate}`;
      }
    } else if (useLLMVibe) {
      analysisPrefix = 'llm-vibe';
      if (!customPrompt) {
        templateSuffix = `-${promptTemplate}`;
      }
    } else {
      analysisPrefix = 'ast';
    }
    
    let outputPath: string;
    let dotContent: string;
    let finalGraph: Graph;
    
    if (useHighLevel) {
      // Generate ONLY high-level diagram using graph operations (collapse + dedupe)
      console.log('📊 Generating high-level call graph diagram...');
      
      // Apply graph operations: collapse all nodes, then dedupe
      finalGraph = graphOps.getSelectiveHighLevelGraph(graph!, highLevelClusters);
      
      // Generate DOT using GraphDiagramGenerator
      const graphGenerator = new GraphDiagramGenerator();
      dotContent = graphGenerator.generateDot(finalGraph);

      // Save high-level diagram to file
      outputPath = path.join(projectPath, `call-graph-${analysisPrefix}${templateSuffix}-high-level.dot`);
      graphGenerator.saveToFile(dotContent, outputPath);
      console.log(`💾 High-level call graph saved to: ${outputPath}`);
    } else {
      // Generate detailed diagram using GraphDiagramGenerator
      const graphGenerator = new GraphDiagramGenerator();
      console.log('📊 Generating call graph diagram...');
      finalGraph = graph!;
      dotContent = graphGenerator.generateDot(finalGraph);

      // Save detailed diagram to file
      outputPath = path.join(projectPath, `call-graph-${analysisPrefix}${templateSuffix}.dot`);
      graphGenerator.saveToFile(dotContent, outputPath);
      console.log(`💾 Detailed call graph saved to: ${outputPath}`);
    }
    
    // Generate SVG files if requested
    if (generateSVGFiles) {
      console.log(`\n🎨 Generating SVG files...`);
      const svgRenderer = new GraphvizRenderer();
      
      if (useHighLevel) {
        const svgPath = path.join(projectPath, `call-graph-${analysisPrefix}${templateSuffix}-high-level.svg`);
        await svgRenderer.generateSVG(outputPath, svgPath);
      } else {
        const svgPath = path.join(projectPath, `call-graph-${analysisPrefix}${templateSuffix}.svg`);
        await svgRenderer.generateSVG(outputPath, svgPath);
      }
    }
    
    // Output to Miro if requested
    if (outputToMiro) {
      try {
        const miroGenerator = new MiroCallGraphGenerator();
        const boardName = `Call Graph - ${path.basename(projectPath)}`;
        console.log(`\n🎨 Creating Miro board...`);
        
        // Debug logging: check what graph we're passing to Miro
        console.log(`🔍 Debug: Miro graph has ${finalGraph.nodes.size} nodes and ${finalGraph.edges.length} edges`);
        console.log(`🔍 Debug: First 5 node IDs:`, Array.from(finalGraph.nodes.keys()).slice(0, 5));
        console.log(`🔍 Debug: First 5 edge sources:`, finalGraph.edges.slice(0, 5).map(e => e.from));
        console.log(`🔍 Debug: First 5 edge targets:`, finalGraph.edges.slice(0, 5).map(e => e.to));
        
        const boardUrl = await miroGenerator.createBoard(finalGraph, dotContent, boardName);
        console.log(`✅ Miro board created: ${boardUrl}`);
      } catch (error) {
        console.error('❌ Failed to create Miro board:', error instanceof Error ? error.message : error);
        console.log('   Make sure MIRO_ACCESS_TOKEN is set in your .env file');
      }
    }
    
    console.log('\n📋 Summary:');
    
    // Calculate statistics from Graph structure
    const fileNodes = Array.from(finalGraph.nodes.values()).filter(n => n.type === 'file');
    const classNodes = Array.from(finalGraph.nodes.values()).filter(n => n.type === 'class');
    const functionNodes = Array.from(finalGraph.nodes.values()).filter(n => n.type === 'function' || n.type === 'method');
    
    console.log(`   Files analyzed: ${fileNodes.length}`);
    console.log(`   Functions/Methods: ${functionNodes.length}`);
    console.log(`   Call relationships: ${finalGraph.edges.length}`);
    console.log(`   Classes: ${classNodes.length}`);

    if (!outputToMiro && !generateSVGFiles) {
      console.log('\n🎨 To generate visual diagrams:');
      console.log('   1. Install Graphviz: apt-get install graphviz (or brew install graphviz on macOS)');
      
      if (useHighLevel) {
        console.log(`   2. High-level: dot -Tsvg "${outputPath}" -o call-graph-${analysisPrefix}${templateSuffix}-high-level.svg`);
      } else {
        console.log(`   2. Detailed: dot -Tsvg "${outputPath}" -o call-graph-${analysisPrefix}${templateSuffix}.svg`);
      }
      
      console.log('   3. Open the SVG files in your browser');
      console.log('\n   💡 Or use --svg flag to auto-generate SVGs!');
    }
    
    if (!outputToMiro) {
      console.log('\n   💡 Or use --miro flag to output directly to a Miro board!');
      
      if (useHighLevel) {
        console.log('   💡 Remove --highlevel for detailed function/method-level view!');
      } else {
        console.log('   💡 Add --highlevel for a simplified file-to-file view!');
      }
    }

    // Display some sample nodes for verification
    console.log('\n🔍 Sample nodes found:');
    let count = 0;
    for (const [, node] of finalGraph.nodes) {
      if (count >= 5) break;
      const location = node.metadata?.file || 'unknown';
      const className = node.metadata?.className ? ` in ${node.metadata.className}` : '';
      console.log(`   ${node.type}: ${node.name} (${location}${className})`);
      count++;
    }
    if (finalGraph.nodes.size > 5) {
      console.log(`   ... and ${finalGraph.nodes.size - 5} more`);
    }

  } catch (error) {
    console.error('❌ Error analyzing project:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}