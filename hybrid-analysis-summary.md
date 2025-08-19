Domain-Based Clustering Analysis
=====================================

Found 6 domain clusters:

🏷️  **Static Code Analysis Core** (static-code-analysis-core)
   Domain: code-analysis
   Description: Components responsible for parsing source code (AST) to extract raw function call relationships and control flow information.
   Nodes: 28 functions/methods
   Reasoning: These nodes form the foundational layer for understanding the codebase. They directly interact with the source code's Abstract Syntax Tree (AST) to extract fundamental information about function calls and control flow paths, without external dependencies like LLMs for the analysis itself.

🏷️  **Graph Data Management & Operations** (graph-data-management)
   Domain: data-modeling
   Description: Components defining the data structures for graphs and providing utilities for manipulating, transforming, and simplifying graph data.
   Nodes: 11 functions/methods
   Reasoning: This cluster represents the core data model and the algorithms applied to the graph data. 'types.ts' likely defines the graph structures, while 'graph-adapter.ts' handles conversions between graph formats, and 'graph-operations.ts' provides methods for common graph manipulations like deduplication, collapsing nodes, and extracting high-level views.

🏷️  **LLM Integration & Orchestration** (llm-integration-orchestration)
   Domain: ai-integration
   Description: Components responsible for interacting with Large Language Models, managing prompts, caching responses, and parsing LLM output for advanced analysis like clustering and summarization.
   Nodes: 62 functions/methods
   Reasoning: This is a distinct architectural layer focused on leveraging LLMs. It encompasses everything from preparing input for LLMs (prompt templates, formatting), managing LLM interactions (caching, querying), and interpreting their responses (parsing, validation, applying clustering). Both 'hybrid-analyzer' and 'llm-vibe-analyzer' are orchestrators within this domain.

🏷️  **Diagram & Visualization Generation** (diagram-visualization-generation)
   Domain: visualization
   Description: Components responsible for converting graph data into visual representations (e.g., DOT, SVG) and saving them to files.
   Nodes: 30 functions/methods
   Reasoning: This cluster groups all functionalities related to creating visual outputs from the analyzed graph data. It includes general diagramming, specific control flow diagramming, advanced graph diagramming with clustering, and the underlying SVG rendering capabilities using Graphviz.

🏷️  **External Platform Integration (Miro)** (external-platform-integration-miro)
   Domain: platform-integration
   Description: Components dedicated to integrating with the Miro collaborative whiteboard platform, including layout extraction and Miro-specific object creation.
   Nodes: 16 functions/methods
   Reasoning: This cluster represents a specific integration layer for an external collaborative platform, Miro. 'layout.ts' is included here because its primary consumer and purpose in this project is to provide layout information necessary for Miro board generation, making it functionally cohesive with the Miro integration.

🏷️  **Application Orchestration** (application-orchestration)
   Domain: application-lifecycle
   Description: The main entry point of the application, responsible for coordinating the execution of various analysis and generation tasks.
   Nodes: 2 functions/methods
   Reasoning: This cluster represents the top-level control flow of the application. The 'main' function in 'index.ts' acts as the orchestrator, calling methods from other domain-specific clusters to perform the overall call graph analysis, LLM processing, and diagram generation.

Overall Reasoning:
The clustering approach focuses on identifying distinct functional domains and architectural layers within the 'callgraph' project. 

1.  **Static Code Analysis Core:** Represents the fundamental capability of extracting information directly from source code using ASTs.
2.  **Graph Data Management & Operations:** Handles the abstract representation and manipulation of the graph data itself, independent of how it's generated or visualized.
3.  **LLM Integration & Orchestration:** A clear, separate layer for all AI-related functionalities, including prompt management, caching, and parsing LLM responses.
4.  **Diagram & Visualization Generation:** Groups all components responsible for rendering the graph data into human-readable visual formats.
5.  **External Platform Integration (Miro):** A specialized vertical for integrating with a specific external tool, including its necessary layout utilities.
6.  **Application Orchestration:** The top-level entry point that ties all these specialized components together to form the complete application workflow.

This approach avoids simple file-based groupings and instead highlights the semantic responsibilities and interdependencies of different parts of the system, providing a clearer understanding of its architecture.
