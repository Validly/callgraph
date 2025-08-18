# TypeScript Call Graph Generator

A CLI tool that generates call graph diagrams for TypeScript projects. The tool performs function call analysis on your TypeScript code and creates visual representations showing how functions, methods, and classes are interconnected.

## Features

- 🔍 **Function call analysis** - Analyzes TypeScript/JavaScript files using TypeScript AST
- 📊 **Multiple graph views** - Detailed function-level or high-level file-to-file relationships
- 🎯 **Graph operations** - Dedupe and collapse operations for different visualization levels
- 🏗️ **Hierarchical visualization** - Files as containers with classes and their methods
- 🎨 **Multiple output formats** - DOT files, SVG generation, and Miro board integration
- 💻 **User-friendly CLI** - Interactive prompts and command-line flags
- ⚡ **Fast processing** - Built with Bun for optimal performance
- 🔧 **Extensible architecture** - Generic graph structure ready for other analysis types

## Installation

```bash
bun install
```

## Usage

### Interactive Mode
```bash
bun run index.ts
```
The tool will prompt you for the directory path of your TypeScript project.

### Command Line Mode
```bash
# Basic analysis (detailed view)
bun run index.ts /path/to/your/project

# High-level view (file-to-file relationships only)
bun run index.ts /path/to/your/project --highlevel

# Generate SVG files automatically
bun run index.ts /path/to/your/project --svg

# Output to Miro board
bun run index.ts /path/to/your/project --miro

# Combine flags
bun run index.ts /path/to/your/project --highlevel --svg --miro
```

### Test on This Project
```bash
bun run test
```

## Output

The tool generates DOT files in your project directory:
- `call-graph.dot` - Detailed function-level call graph
- `call-graph-high-level.dot` - File-to-file relationship graph (with `--highlevel`)

### Manual SVG Generation
1. Install Graphviz: `apt-get install graphviz` (or `brew install graphviz` on macOS)
2. Generate SVG: `dot -Tsvg call-graph.dot -o call-graph.svg`
3. Open the SVG file in your browser

### Automatic SVG Generation
Use the `--svg` flag to automatically generate SVG files.

### Miro Integration
Use the `--miro` flag to create interactive boards in Miro (requires `.env` file with Miro credentials).

## Example Output

The tool will show:
- Number of files analyzed
- Functions/methods found
- Call relationships discovered
- Classes detected
- Sample nodes for verification

## Architecture

### Core Analysis
- `function-call-analyzer.ts` - TypeScript function call analysis using AST parsing
- `types.ts` - Data structures for CallGraph (legacy) and generic Graph interfaces
- `graph-adapter.ts` - Converts CallGraph to generic Graph format

### Graph Operations
- `graph-operations.ts` - Dedupe and collapse operations for different visualization levels
- `diagram.ts` & `graph-diagram.ts` - Graphviz DOT format generators
- `svg-generator.ts` - Centralized Graphviz execution and SVG generation

### Visualization & Integration
- `layout.ts` - Graphviz layout extraction for coordinate positioning
- `miro.ts` - Miro board generation with interactive call graphs

### CLI & Testing
- `index.ts` - CLI interface with interactive prompts and command-line flags
- `test.ts` - Self-test utility that analyzes the project itself
