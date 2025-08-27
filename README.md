# TypeScript Call Graph Generator

A powerful CLI tool that generates call graph diagrams for TypeScript projects with advanced AI-powered clustering and multi-level visualization capabilities. The tool combines static analysis with LLM-based semantic understanding to create insightful visualizations of your codebase architecture.

## Features

### Core Analysis
- 🔍 **AST-based function call analysis** - Precise TypeScript/JavaScript analysis using TypeScript compiler API
- 🧠 **LLM-powered semantic clustering** - AI-driven domain-based code organization 
- 🔄 **Hybrid analysis** - Combines AST precision with LLM semantic understanding
- 📊 **Multiple analysis modes** - AST-only, LLM-only, or hybrid approaches

### Advanced Visualization
- 🎯 **Granular depth control** - Customize expansion depth for each cluster independently
- 🏗️ **Hierarchical clustering** - Domain → File → Class → Method hierarchy
- 📈 **Call count visualization** - Shows frequency of function calls (x2, x3, etc.)
- 🎨 **Multiple output formats** - DOT files, SVG generation, and Miro board integration
- ↗️ **Simplified arrow directions** - Clear call flow visualization

### Graph Operations
- 🔧 **Pure graph architecture** - Generic, extensible graph data structure
- 🎛️ **Flexible high-level views** - Selective cluster collapsing with depth control
- ⚡ **Edge deduplication** - Smart rendering-level deduplication preserving call counts
- 🏷️ **Semantic clustering** - Domain-aware code organization

### Integration & Usability
- 💻 **Rich CLI interface** - Interactive prompts and comprehensive command-line flags
- 🌐 **Miro integration** - Export interactive boards to collaborative platform
- 📋 **Analysis summaries** - Detailed breakdowns of discovered clusters and relationships
- ⚡ **Fast processing** - Built with Bun for optimal performance

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
# Basic AST analysis (detailed view)
bun run index.ts /path/to/your/project

# LLM-powered semantic analysis
bun run index.ts /path/to/your/project --llm

# Hybrid analysis (AST + LLM clustering)
bun run index.ts /path/to/your/project --hybrid

# Nested hybrid analysis (Domain + File/Class clusters)
bun run index.ts /path/to/your/project --nested-hybrid

# Control flow analysis for specific function
bun run index.ts /path/to/your/project --controlflow=functionName
bun run index.ts /path/to/your/project --controlflow=file.ts:functionName

# High-level view (collapse clusters)
bun run index.ts /path/to/your/project --highlevel

# Granular high-level view (selective expansion)
bun run index.ts /path/to/your/project --highlevel="all:0,-Static Code Analysis Engine:1"

# Generate SVG files automatically
bun run index.ts /path/to/your/project --svg

# Output to Miro board
bun run index.ts /path/to/your/project --miro

# Combine analysis modes with output formats
bun run index.ts /path/to/your/project --nested-hybrid --highlevel --svg --miro
```

### Test on This Project
```bash
bun run test
```

## Analysis Modes

### AST Analysis (Default)
- **Command**: `bun run index.ts /path/to/project`
- **Description**: Pure static analysis using TypeScript compiler API
- **Output**: Function-level call relationships with file/class clustering
- **Best for**: Precise call tracking, small to medium codebases

### LLM Analysis
- **Command**: `bun run index.ts /path/to/project --llm`
- **Description**: AI-powered semantic understanding of code architecture
- **Output**: Domain-based clustering with semantic relationships
- **Best for**: Understanding high-level architecture, large codebases

### Hybrid Analysis
- **Command**: `bun run index.ts /path/to/project --hybrid`
- **Description**: Combines AST precision with LLM semantic clustering
- **Output**: Domain clusters containing precise function call relationships
- **Best for**: Balance of accuracy and semantic insight

### Nested-Hybrid Analysis
- **Command**: `bun run index.ts /path/to/project --nested-hybrid`
- **Description**: Three-level hierarchy: Domain → File → Class → Methods
- **Output**: Comprehensive multi-level clustering
- **Best for**: Complex codebases requiring detailed organization

### Control Flow Analysis
- **Command**: `bun run index.ts /path/to/project --controlflow=functionName`
- **Description**: Analyzes control flow within a specific function
- **Output**: Detailed control flow diagram showing branches, loops, and exceptions
- **Best for**: Understanding complex function logic and execution paths
- **Examples**:
  - `--controlflow=myFunction` - Analyze function across all files
  - `--controlflow=utils.ts:helper` - Analyze specific function in specific file

## High-Level Views

### Standard High-Level
```bash
# Collapse all clusters to show only high-level relationships
bun run index.ts /path/to/project --highlevel
```

### Granular High-Level Control
```bash
# Expand specific clusters while keeping others collapsed
bun run index.ts /path/to/project --highlevel="all:0,-Static Code Analysis Engine:1"

# Multiple selective expansions
bun run index.ts /path/to/project --highlevel="all:0,-Domain A:1,-Domain B:2"
```

**Syntax:**
- `all:N` - Set default expansion depth for all clusters
- `-ClusterName:N` - Override expansion depth for specific cluster
- `N=0` - Collapsed (cluster only)
- `N=1` - Show immediate children (e.g., files within domain)
- `N=2` - Show two levels (e.g., classes within files within domain)

## Output Files

The tool generates DOT files based on analysis mode:
- `call-graph-ast.dot` - AST analysis output
- `call-graph-llm-*.dot` - LLM analysis output with mode suffix
- `call-graph-hybrid-*.dot` - Hybrid analysis output
- `call-graph-nested-hybrid-*.dot` - Nested-hybrid analysis output
- `call-graph-controlflow-*.dot` - Control flow analysis output
- `*-high-level.dot` - High-level collapsed versions (with `--highlevel`)

### Automatic SVG Generation
Use the `--svg` flag to automatically generate SVG files for all DOT outputs.

### Manual SVG Generation
1. Install Graphviz: `apt-get install graphviz` (or `brew install graphviz` on macOS)
2. Generate SVG: `dot -Tsvg call-graph-*.dot -o call-graph.svg`
3. Open the SVG file in your browser

### Miro Integration
Use the `--miro` flag to create interactive boards in Miro (requires `.env` file with Miro credentials).

#### Miro Setup
1. Create `.env` file with:
   ```
   MIRO_ACCESS_TOKEN=your_token
   MIRO_BOARD_ID=your_board_id
   ```
2. Get tokens from Miro Developer Console
3. Run with `--miro` flag for interactive board generation

## Features Deep Dive

### Call Count Visualization
Edges show call frequency with labels like `x2`, `x3` for multiple calls between same functions.

### Edge Deduplication
- **Data Structure Level**: Preserves multiple edges for accurate call counts
- **Rendering Level**: Deduplicates edges in DOT output while preserving count information
- **Result**: Clean visualizations with accurate call frequency data

### Semantic Clustering
LLM-powered analysis identifies logical domains:
- **Static Code Analysis Engine** - AST parsing and analysis
- **Graph Data Management** - Data structures and operations
- **LLM Integration & Orchestration** - AI interaction layers
- **Diagram & Visualization Generation** - Output generation
- **External Platform Integration** - Third-party integrations
- **Application Orchestration** - Main workflow coordination

### Pure Graph Architecture
Generic graph data structure supports:
- Arbitrary clustering depths
- Semantic-agnostic organization
- Extensible analysis types
- Consistent API across all modes

## Example Commands

```bash
# Quick analysis of current project
bun run test

# Comprehensive analysis with all outputs
bun run index.ts . --nested-hybrid --svg --miro

# Focus on specific domain with selective expansion
bun run index.ts . --hybrid --highlevel="all:0,-LLM Integration:1" --svg

# Control flow analysis examples
bun run index.ts . --controlflow=main --svg
bun run index.ts . --controlflow=utils.ts:helper --svg
bun run index.ts . --controlflow=analyzeControlFlow

# Domain-only high-level view
bun run index.ts . --hybrid --highlevel --svg

# Compare different analysis approaches
bun run index.ts . --ast --svg
bun run index.ts . --llm --svg
bun run index.ts . --hybrid --svg
bun run index.ts . --controlflow=myFunction --svg
```

## Analysis Output

The tool provides detailed statistics:
- **Files analyzed** - Source files processed
- **Functions/methods found** - Total callable entities
- **Call relationships discovered** - Function-to-function calls
- **Clusters detected** - Organizational groupings
- **Analysis summary** - Domain descriptions and reasoning

## Technical Architecture

### Core Analysis Engines
- **`function-call-analyzer.ts`** - TypeScript AST-based function call analysis using compiler API
- **`hybrid-analyzer.ts`** - Orchestrates AST analysis with LLM-based semantic clustering
- **`llm-vibe-analyzer.ts`** - Pure LLM-based code understanding and relationship extraction
- **`control-flow-analyzer.ts`** - Control flow analysis for advanced call graph generation

### Data Structures & Operations
- **`types.ts`** - Pure Graph interface with Node/Edge relationships (CallGraph removed)
- **`graph-operations.ts`** - Graph transformations:
  - `dedupe()` - Combines multiple edges with call counts
  - `collapse()` - Flattens hierarchy by removing child nodes
  - `getHighLevelGraph()` - Standard cluster collapsing
  - `getSelectiveHighLevelGraph()` - Granular depth-controlled expansion

### LLM Integration Layer
- **`prompt-templates.ts`** - Structured prompts for semantic analysis
- **`llm-cache.ts`** - Response caching for efficient re-analysis
- **`hybrid-response-parser.ts`** - Parsing LLM responses into graph clustering
- **`llm-response-parser.ts`** - General LLM response processing utilities

### Visualization & Output
- **`graph-diagram.ts`** - Modern DOT generator with clustering support and edge deduplication
- **`diagram.ts`** - Legacy DOT format support
- **`control-flow-diagram.ts`** - Specialized control flow visualization
- **`svg-generator.ts`** - Centralized Graphviz execution and multi-format output

### Platform Integration
- **`layout.ts`** - Graphviz layout extraction for coordinate positioning
- **`miro.ts`** - Interactive Miro board generation with graph data

### CLI & Orchestration
- **`index.ts`** - Comprehensive CLI with interactive prompts and advanced flag parsing
- **`test.ts`** - Self-test utility demonstrating all analysis modes

### Key Design Patterns
- **Pure Graph Architecture** - Semantic-agnostic data structures
- **Hierarchical Node IDs** - Format: `domain::file::class::method` for unique identification
- **Rendering-Level Deduplication** - Preserves call counts while cleaning visualization
- **Modular Analysis Pipeline** - Pluggable analysis engines with consistent output
- **Depth-Controlled Expansion** - Granular cluster visibility control
