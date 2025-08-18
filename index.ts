#!/usr/bin/env bun

import prompts from 'prompts';
import * as path from 'path';
import * as fs from 'fs';
import { TypeScriptFunctionCallAnalyzer } from './function-call-analyzer.js';
import { DiagramGenerator } from './diagram.js';
import { MiroCallGraphGenerator } from './miro.js';
import { convertCallGraphToGraph } from './graph-adapter.js';
import { GraphDiagramGenerator } from './graph-diagram.js';
import { graphOps } from './graph-operations.js';
import { GraphvizRenderer } from './svg-generator.js';

async function main() {
  console.log('🔗 TypeScript Call Graph Generator');
  console.log('===================================\n');

  let projectPath: string;
  let outputToMiro = false;
  let useHighLevel = false;
  let generateSVGFiles = false;
  let showHelp = false;

  // Parse command line arguments
  const args = process.argv.slice(2);
  const miroIndex = args.indexOf('--miro');
  if (miroIndex !== -1) {
    outputToMiro = true;
    args.splice(miroIndex, 1); // Remove --miro flag from args
  }
  
  const highLevelIndex = args.indexOf('--highlevel');
  if (highLevelIndex !== -1) {
    useHighLevel = true;
    args.splice(highLevelIndex, 1); // Remove --highlevel flag from args
  }

  const svgIndex = args.indexOf('--svg');
  if (svgIndex !== -1) {
    generateSVGFiles = true;
    args.splice(svgIndex, 1); // Remove --svg flag from args
  }

  const helpIndex = args.findIndex(arg => arg === '--help' || arg === '-h');
  if (helpIndex !== -1) {
    showHelp = true;
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
  --highlevel             Generate ONLY high-level view (file-to-file relationships)
  --miro                  Output call graph to Miro board
  --help, -h              Show this help message

Examples:
  bun run index.ts                    # Interactive mode, detailed view only
  bun run index.ts .                  # Analyze current directory, detailed view only
  bun run index.ts . --highlevel      # Generate ONLY high-level view
  bun run index.ts . --svg            # Generate detailed DOT + SVG
  bun run index.ts . --highlevel --svg # Generate high-level DOT + SVG
  bun run index.ts . --miro           # Generate detailed view + Miro board
  bun run index.ts . --miro --highlevel # Generate high-level view + Miro board
`);
    return;
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

  try {
    // Analyze TypeScript project for function calls
    const analyzer = new TypeScriptFunctionCallAnalyzer();
    console.log('🔍 Analyzing TypeScript files...');
    const callGraph = analyzer.analyze(projectPath);

    console.log(`✅ Found ${callGraph.nodes.size} functions/methods and ${callGraph.edges.length} calls`);

    let outputPath: string;
    let dotContent: string;
    
    if (useHighLevel) {
      // Generate ONLY high-level diagram using graph operations (collapse + dedupe)
      console.log('📊 Generating high-level call graph diagram...');
      
      // Convert CallGraph to generic Graph format
      const graph = convertCallGraphToGraph(callGraph);
      
      // Apply graph operations: collapse all nodes, then dedupe
      const highLevelGraph = graphOps.getHighLevelGraph(graph);
      
      // Generate DOT using GraphDiagramGenerator
      const graphGenerator = new GraphDiagramGenerator();
      dotContent = graphGenerator.generateDot(highLevelGraph);

      // Save high-level diagram to file
      outputPath = path.join(projectPath, 'call-graph-high-level.dot');
      graphGenerator.saveToFile(dotContent, outputPath);
      console.log(`💾 High-level call graph saved to: ${outputPath}`);
    } else {
      // Generate detailed diagram
      const generator = new DiagramGenerator();
      console.log('📊 Generating call graph diagram...');
      dotContent = generator.generateDot(callGraph);

      // Save detailed diagram to file
      outputPath = path.join(projectPath, 'call-graph.dot');
      generator.saveToFile(dotContent, outputPath);
      console.log(`💾 Detailed call graph saved to: ${outputPath}`);
    }
    
    // Generate SVG files if requested
    if (generateSVGFiles) {
      console.log(`\n🎨 Generating SVG files...`);
      const svgRenderer = new GraphvizRenderer();
      
      if (useHighLevel) {
        await svgRenderer.generateSVG(outputPath, path.join(projectPath, 'call-graph-high-level.svg'));
      } else {
        await svgRenderer.generateSVG(outputPath, path.join(projectPath, 'call-graph.svg'));
      }
    }
    
    // Output to Miro if requested
    if (outputToMiro) {
      try {
        const miroGenerator = new MiroCallGraphGenerator();
        const boardName = `Call Graph - ${path.basename(projectPath)}`;
        console.log(`\n🎨 Creating Miro board...`);
        const boardUrl = await miroGenerator.createBoard(callGraph, dotContent, boardName);
        console.log(`✅ Miro board created: ${boardUrl}`);
      } catch (error) {
        console.error('❌ Failed to create Miro board:', error instanceof Error ? error.message : error);
        console.log('   Make sure MIRO_ACCESS_TOKEN is set in your .env file');
      }
    }
    
    console.log('\n📋 Summary:');
    console.log(`   Files analyzed: ${callGraph.files.size}`);
    console.log(`   Functions/Methods: ${callGraph.nodes.size}`);
    console.log(`   Call relationships: ${callGraph.edges.length}`);
    console.log(`   Classes: ${callGraph.classes.size}`);

    if (!outputToMiro && !generateSVGFiles) {
      console.log('\n🎨 To generate visual diagrams:');
      console.log('   1. Install Graphviz: apt-get install graphviz (or brew install graphviz on macOS)');
      
      if (useHighLevel) {
        console.log(`   2. High-level: dot -Tsvg "${outputPath}" -o call-graph-high-level.svg`);
      } else {
        console.log(`   2. Detailed: dot -Tsvg "${outputPath}" -o call-graph.svg`);
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
    for (const [id, node] of callGraph.nodes) {
      if (count >= 5) break;
      console.log(`   ${node.type}: ${node.name} (${node.file}${node.className ? ` in ${node.className}` : ''})`);
      count++;
    }
    if (callGraph.nodes.size > 5) {
      console.log(`   ... and ${callGraph.nodes.size - 5} more`);
    }

  } catch (error) {
    console.error('❌ Error analyzing project:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}