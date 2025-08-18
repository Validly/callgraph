# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript call graph generator CLI tool that analyzes TypeScript/JavaScript projects and generates visual diagrams showing function call relationships. The tool is built with Bun and uses the TypeScript compiler API for AST parsing.

## Common Commands

### Development and Testing
```bash
# Install dependencies
bun install

# Run the CLI tool interactively (prompts for directory)
bun run start

# Run the CLI tool on a specific directory
bun run index.ts /path/to/project

# Test the tool on itself (self-test)
bun run test

# Run the standalone test utility
bun run test.ts
```

### Output Generation
```bash
# The tool generates call-graph.dot - to create visual diagram:
dot -Tsvg call-graph.dot -o call-graph.svg
```

## Architecture

### Core Components

**Data Flow: Input → Function Call Analysis → Graph → Diagram Generation → DOT/SVG Output**

1. **`types.ts`** - Core data structures:
   - `CallGraphNode`: Represents functions, methods, and classes (legacy format)
   - `CallGraphEdge`: Represents call relationships (legacy format)
   - `CallGraph`: Central data structure with nodes, edges, and groupings
   - `Graph/Node/Edge`: Generic graph interfaces for extensible analysis

2. **`function-call-analyzer.ts`** - TypeScript function call analysis engine:
   - `TypeScriptFunctionCallAnalyzer.analyze()`: Main entry point - creates TS program and orchestrates analysis
   - `analyzeFileForFunctionCalls()`: Extracts functions, methods, and classes from source files
   - `findCallRelationships()`: Uses TypeChecker to resolve function calls
   - Automatically handles tsconfig.json or falls back to file discovery
   - Excludes node_modules and declaration files

3. **`graph-adapter.ts`** - Converts legacy CallGraph to generic Graph format:
   - `convertCallGraphToGraph()`: Transforms CallGraph into hierarchical Node/Edge structure
   - Creates file-level and class-level clustering for visualization

4. **`graph-operations.ts`** - Graph transformation operations:
   - `dedupe()`: Combines multiple edges between same nodes with type counts
   - `collapse()`: Flattens hierarchy by removing child nodes and redirecting edges
   - `getHighLevelGraph()`: Applies collapse then dedupe for file-to-file view

5. **`diagram.ts` & `graph-diagram.ts`** - Graphviz DOT format generators:
   - Legacy and modern DOT syntax generation with nested clustering
   - File-level clusters (dashed gray containers)
   - Class-level clusters (solid lightblue containers within files)
   - Different node shapes for functions vs classes

6. **`svg-generator.ts`** - Centralized Graphviz execution:
   - `GraphvizRenderer`: Handles DOT to SVG conversion and command execution
   - Supports multiple output formats and error handling

7. **`layout.ts` & `miro.ts`** - Visualization integrations:
   - Graphviz layout extraction for coordinate positioning
   - Miro board generation with interactive call graphs

8. **`index.ts`** - CLI interface:
   - Supports both interactive prompts and command-line arguments
   - Flags: `--svg`, `--highlevel`, `--miro`, `--help`
   - Uses `prompts` library for user-friendly directory input
   - Comprehensive output with statistics and instructions

### Key Design Patterns

- **Node ID Strategy**: Uses format `file::class::method` or `file::function` for unique identification
- **Hierarchical Clustering**: Files contain classes, classes contain methods
- **TypeScript Program Integration**: Leverages TS compiler's type checker for accurate call resolution
- **Recursive Directory Traversal**: Automatically discovers all .ts/.tsx files while excluding node_modules

### Important Implementation Details

- The function call analyzer creates a TypeScript Program to get full type information for accurate call resolution
- Call relationship detection happens in a separate pass after all nodes are discovered
- Node IDs are sanitized for DOT format compatibility (non-alphanumeric chars become underscores)
- Generic Graph structure enables extensibility for future analysis types beyond function calls
- High-level graphs use graph operations (collapse + dedupe) to create file-to-file relationship views
- The tool is self-testing - `bun run test` analyzes its own codebase as validation