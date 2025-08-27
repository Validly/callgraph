# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive TypeScript call graph generator CLI tool that combines static analysis with AI-powered semantic understanding to create sophisticated visualizations of code architecture. The tool supports multiple analysis modes (AST, LLM, hybrid, nested-hybrid) and advanced clustering with granular depth control. Built with Bun and integrates TypeScript compiler API, LLM APIs, Graphviz, and Miro platform.

## Common Commands

### Development and Testing
```bash
# Install dependencies
bun install

# Run the CLI tool interactively (prompts for directory)
bun run start

# Analysis modes
bun run index.ts /path/to/project                    # AST analysis (default)
bun run index.ts /path/to/project --llm              # LLM semantic analysis
bun run index.ts /path/to/project --hybrid           # AST + LLM clustering
bun run index.ts /path/to/project --nested-hybrid    # 3-level clustering\nbun run index.ts /path/to/project --controlflow=functionName  # Control flow analysis

# High-level views
bun run index.ts /path/to/project --highlevel        # Standard cluster collapse
bun run index.ts /path/to/project --highlevel="all:0,-Domain:1"  # Granular control

# Output formats
bun run index.ts /path/to/project --svg              # Auto-generate SVG
bun run index.ts /path/to/project --miro             # Create Miro board

# Test the tool on itself (self-test)
bun run test

# Run the standalone test utility
bun run test.ts
```

### Output Generation
```bash
# Tool generates mode-specific DOT files:
# call-graph-ast.dot, call-graph-hybrid-*.dot, etc.

# Manual SVG generation:
dot -Tsvg call-graph-*.dot -o call-graph.svg

# All output files are automatically named with analysis mode and parameters
# Example: call-graph-nested-hybrid-hybrid-clustering-high-level.dot
```

## Architecture

### Core Components

**Data Flow: Input → Analysis Engine → Pure Graph Structure → Graph Operations → Visualization → Output**

### Analysis Engines

1. **AST Analysis Engine** (`function-call-analyzer.ts`):
   - Uses TypeScript compiler API for precise function call analysis
   - Creates TypeScript Program for full type information
   - Discovers functions, methods, classes through AST traversal
   - Resolves call relationships using TypeChecker
   - Outputs pure Graph structure with file/class clustering

2. **LLM Analysis Engine** (`llm-vibe-analyzer.ts`):
   - Semantic understanding using Gemini 2.5 Flash
   - Analyzes code for architectural patterns and domains
   - Creates domain-based clustering with reasoning
   - Maintains call relationships through LLM interpretation
   - Outputs Graph structure with semantic clustering

3. **Hybrid Analysis Engine** (`hybrid-analyzer.ts`):
   - Combines AST precision with LLM semantic clustering
   - Uses AST for accurate call relationships
   - Uses LLM for intelligent domain organization
   - Merges both approaches into cohesive Graph structure
   - Best of both worlds: accuracy + semantic insight

4. **Nested-Hybrid Analysis** (orchestrated in `index.ts`):
   - Starts with hybrid analysis for domain clustering
   - Re-introduces file/class clusters within domains
   - Creates 3-level hierarchy: Domain → File → Class → Methods
   - Preserves semantic organization with structural detail

5. **Control Flow Analysis Engine** (`control-flow-analyzer.ts`):\n   - Analyzes control flow within a specific function using AST traversal\n   - Creates detailed flow diagrams with branches, loops, and exception handling\n   - Identifies control structures: if/else, while/for loops, try/catch, switch statements\n   - Tracks function calls within the control flow\n   - Generates specialized nodes for different statement types (START, END, conditions, etc.)\n   - Outputs pure Graph structure with control flow-specific node types\n\n### Core Data Structures

1. **`types.ts`** - Pure Graph architecture (CallGraph eliminated):
   - `Graph`: Central interface with nodes Map, edges array, and metadata
   - `Node`: Generic node with id, label, type, parent/children relationships
   - `Edge`: Connection between nodes with source, target, type, and metadata
   - Semantic-agnostic design supports arbitrary clustering depths

### LLM Integration Layer

2. **`prompt-templates.ts`** - Structured prompts for semantic analysis:
   - Domain clustering prompts with examples and constraints
   - Function call analysis prompts for LLM-based relationship detection
   - Consistent formatting for reliable LLM parsing

3. **`llm-cache.ts`** - Response caching and management:
   - File-based caching of LLM responses to avoid redundant API calls
   - Cache invalidation based on code changes
   - Supports development workflow with fast iteration

4. **Response Parsers**:
   - `hybrid-response-parser.ts`: Parses LLM clustering responses into Graph structure
   - `llm-response-parser.ts`: General utilities for LLM response processing
   - Handles single-level clustering (eliminates container slugs)
   - Robust error handling and validation

### Graph Operations Engine

5. **`graph-operations.ts`** - Advanced graph transformation operations:
   - `dedupe()`: Combines multiple edges between same nodes with call count aggregation
   - `collapse()`: Flattens hierarchy by removing child nodes and redirecting edges to parents
   - `getHighLevelGraph()`: Standard cluster collapsing (collapse + dedupe)
   - `getSelectiveHighLevelGraph()`: Granular depth control with syntax parsing
   - `getDepthControlledGraph()`: Hierarchical expansion with per-cluster depth limits
   - Helper methods for depth-controlled node mapping and copying
   
   **Granular High-Level Syntax**:
   - `"all:0"` - Collapse all clusters
   - `"all:1,-Domain:2"` - Expand Domain to depth 2, others to depth 1
   - Supports negative syntax for cluster-specific overrides

### Visualization & Output

6. **`graph-diagram.ts`** - Modern DOT format generator:
   - Hierarchical cluster rendering with nested subgraphs
   - Domain clusters (dashed gray containers)
   - File clusters (solid lightgray folder icons)
   - Class clusters (solid lightcyan containers within files)
   - Node shape differentiation (ellipse for functions, box for classes)
   - **Rendering-level edge deduplication** with call count labels (x2, x3, etc.)
   - Simplified arrow directions (unidirectional call flow)
   - Sanitized DOT identifiers for compatibility

7. **`control-flow-diagram.ts`** - Control flow visualization:\n   - Specialized DOT generator for control flow graphs\n   - Node shapes and colors for different control flow elements:\n     - START/END nodes (ellipse, green/red)\n     - Condition nodes (diamond, yellow)\n     - Function call nodes (rounded rectangle, blue)\n     - Loop/switch nodes (specialized shapes)\n   - Edge styling for different flow types (true/false, exception, loop_back)\n   - Optimized layout for control flow readability\n\n8. **`diagram.ts`** - Legacy DOT format support:
   - Maintains backward compatibility
   - Simpler clustering without advanced features

9. **`svg-generator.ts`** - Centralized Graphviz execution:
   - `GraphvizRenderer`: Handles DOT to SVG conversion with error handling
   - Supports multiple output formats (SVG, PNG, etc.)
   - Automatic file naming based on analysis mode and parameters

### Platform Integration

9. **`layout.ts`** - Graphviz layout extraction:
   - Parses Graphviz plain format output for coordinate positioning
   - Extracts node positions and dimensions for interactive layouts
   - Supports Miro board generation with precise positioning

10. **`miro.ts`** - Interactive Miro board generation:
    - `MiroCallGraphGenerator`: Creates collaborative whiteboards
    - Node positioning based on Graphviz layouts
    - Interactive edges and relationship mapping
    - Supports high-level and detailed views
    - Requires `.env` configuration with Miro API credentials

### CLI & Orchestration

11. **`index.ts`** - Comprehensive CLI interface:
    - Interactive prompts using `prompts` library
    - Advanced command-line flag parsing with granular options
    - Analysis mode orchestration and pipeline management
    - Nested clustering algorithm implementation
    - Statistics reporting and analysis summaries
    - Error handling and user guidance
    
    **Supported Flags**:
    - `--ast`, `--llm`, `--hybrid`, `--nested-hybrid` - Analysis modes
    - `--highlevel[=syntax]` - High-level views with granular control
    - `--svg` - Automatic SVG generation
    - `--miro` - Miro board creation
    - `--help` - Usage information

12. **`test.ts`** - Self-test and validation:
    - Analyzes the project itself as validation
    - Demonstrates all analysis modes
    - Provides consistent testing baseline

### Key Design Patterns

- **Pure Graph Architecture**: Eliminated semantic coupling between data structures and clustering logic
- **Hierarchical Node IDs**: Uses format `domain::file::class::method` for unique identification across all clustering levels
- **Semantic-Agnostic Data Structures**: Graph interface supports arbitrary clustering depths without implying semantics
- **Modular Analysis Pipeline**: Pluggable analysis engines with consistent Graph output
- **Rendering-Level Deduplication**: Preserves call count data while cleaning visualization
- **TypeScript Program Integration**: Leverages TS compiler's type checker for accurate call resolution
- **LLM-Powered Semantic Understanding**: AI-driven domain identification with structured reasoning
- **Depth-Controlled Expansion**: Granular cluster visibility with per-cluster depth overrides

### Important Implementation Details

#### AST Analysis
- Creates TypeScript Program for full type information and accurate call resolution
- Call relationship detection happens in separate pass after all nodes are discovered
- Automatic tsconfig.json discovery or fallback to file discovery
- Excludes node_modules and declaration files automatically
- Recursive directory traversal for comprehensive project analysis

#### LLM Integration
- Uses Gemini 2.5 Flash for semantic analysis and domain clustering
- File-based caching prevents redundant API calls during development
- Structured prompts ensure consistent and parseable responses
- Single-level clustering eliminates confusing container hierarchies
- Robust error handling for API failures and parsing issues

#### Graph Operations
- Node IDs sanitized for DOT format compatibility (non-alphanumeric → underscores)
- Edge deduplication preserves call counts for visualization (x2, x3 labels)
- Depth-controlled expansion supports syntax like `"all:0,-Domain:1"`
- Graph structure enables extensibility for future analysis types beyond function calls
- Consistent parent/children relationships maintain hierarchy integrity

#### Visualization
- High-level graphs use graph operations (collapse + dedupe) for clean cluster views
- Rendering-level deduplication maintains data structure integrity while cleaning output
- Simplified arrow directions show only function call flow (removes confusing bidirectional arrows)
- Automatic file naming includes analysis mode and parameters for organization
- Multiple output format support (DOT, SVG, Miro boards)

#### Development Workflow
- Self-testing capability - `bun run test` analyzes the project itself as validation
- Comprehensive CLI with interactive prompts and advanced flag parsing
- Analysis summaries provide detailed breakdowns of discovered clusters and relationships
- Error messages guide users through setup and troubleshooting