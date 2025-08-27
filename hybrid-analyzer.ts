import * as path from "path";
import * as fs from "fs";
import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { runCli, type CliOptions } from "repomix";
import type { Graph } from "./types.js";
import { TypeScriptFunctionCallAnalyzer } from "./function-call-analyzer.js";
import { promptEngine, type PromptVariables } from "./prompt-templates.js";
import {
  HybridResponseParser,
  type HybridClusteringResponse,
} from "./hybrid-response-parser.js";
import { llmCache } from "./llm-cache.js";

export interface HybridAnalyzerOptions {
  templateName?: string;
  customPrompt?: string;
  promptSuffix?: string;
  model?: string;
  temperature?: number;
  includeSourceContext?: boolean;
  promptVariables?: PromptVariables;
}

export class HybridAnalyzer {
  private astAnalyzer: TypeScriptFunctionCallAnalyzer;
  private parser: HybridResponseParser;

  constructor() {
    this.astAnalyzer = new TypeScriptFunctionCallAnalyzer();
    this.parser = new HybridResponseParser();
  }

  async analyze(
    projectPath: string,
    options: HybridAnalyzerOptions = {}
  ): Promise<{
    graph: Graph;
    clustering: HybridClusteringResponse;
    summary: string;
  }> {
    const {
      templateName = "hybrid-clustering",
      customPrompt,
      promptSuffix,
      model = "gemini-2.5-flash",
      temperature = 0.1,
      includeSourceContext = false,
      promptVariables = {},
    } = options;

    console.log("🔬 Starting hybrid analysis...");
    console.log("📊 Step 1: Performing AST analysis for precise call graph...");

    // Step 1: Get precise call graph from AST analysis
    const astGraph = this.astAnalyzer.analyze(projectPath);
    console.log(
      `✅ Found ${astGraph.nodes.size} functions/methods and ${astGraph.edges.length} calls`
    );

    // Step 2: Format graph data for LLM
    console.log("📝 Step 2: Formatting graph data for LLM analysis...");
    const { nodes, edges } = this.parser.formatGraphForLLM(astGraph);

    // Step 3: Get source context if requested
    let sourceContext = "";
    if (includeSourceContext) {
      console.log("📦 Step 3: Gathering source code context...");
      sourceContext = await this.getSourceContext(projectPath);
      console.log(`📦 Source context size: ${sourceContext.length} characters`);
    }

    // Step 4: Build prompt for domain analysis
    console.log("🧠 Step 4: Analyzing domain boundaries with LLM...");
    let prompt =
      customPrompt ||
      this.buildPrompt(
        templateName,
        projectPath,
        nodes,
        edges,
        sourceContext,
        promptVariables
      );
    
    // Append suffix if provided
    if (promptSuffix) {
      console.log(`📝 Appending custom suffix to prompt: "${promptSuffix}"`);
      prompt += `\n\n${promptSuffix}`;
    }

    const clusteringResponse = await this.queryLLMForClustering(
      prompt,
      model,
      temperature
    );

    // Step 5: Apply clustering to graph
    console.log("🏗️  Step 5: Applying domain clusters to graph...");
    const hybridGraph = this.parser.applyClusteringToGraph(
      astGraph,
      clusteringResponse
    );

    // Step 6: Generate summary
    const summary = this.parser.generateClusteringSummary(clusteringResponse);

    console.log("✅ Hybrid analysis completed!");
    console.log(
      `📊 Generated ${clusteringResponse.clusters.length} domain-based clusters`
    );

    return {
      graph: hybridGraph,
      clustering: clusteringResponse,
      summary,
    };
  }

  private buildPrompt(
    templateName: string,
    projectPath: string,
    nodes: string,
    edges: string,
    sourceContext: string,
    additionalVariables: PromptVariables
  ): string {
    const template = promptEngine.getTemplate(templateName);
    if (!template) {
      throw new Error(
        `Template '${templateName}' not found. Available templates: ${promptEngine
          .listTemplates()
          .map((t) => t.name)
          .join(", ")}`
      );
    }

    const projectName = path.basename(projectPath);
    const variables: PromptVariables = {
      projectName,
      nodes,
      edges,
      sourceContext,
      ...additionalVariables,
    };

    return promptEngine.renderTemplate(templateName, variables);
  }

  private async queryLLMForClustering(
    prompt: string,
    model: string,
    temperature: number
  ): Promise<HybridClusteringResponse> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log(
      `🔑 API Key status: ${apiKey ? "Present" : "Missing"} (length: ${
        apiKey?.length || 0
      })`
    );
    console.log(`🤖 Using model: ${model}, temperature: ${temperature}`);
    console.log(`📝 Prompt length: ${prompt.length} characters`);

    // Check cache first
    const cachedResponse = await llmCache.get(prompt, model, temperature);
    if (cachedResponse) {
      const clusteringResponse = this.parser.parseClusteringResponse(cachedResponse);
      const validationErrors = this.parser.validateClusteringResponse(clusteringResponse);
      if (validationErrors.length > 0) {
        console.warn("⚠️ Cached clustering response validation issues:");
        validationErrors.forEach((error) => console.warn(`   ${error}`));
      }
      return clusteringResponse;
    }

    if (!apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set. Please set it to use the hybrid analyzer."
      );
    }

    try {
      console.log("📡 Sending clustering request to LLM (streaming)...");
      const startTime = Date.now();
      const { fullStream, text } = streamText({
        model: google(model),
        prompt,
        temperature,
      });

      // Stream progress
      console.log("💭 Streaming clustering analysis...");
      for await (const textDelta of fullStream) {
        process.stdout.write(
          textDelta.type === "reasoning-delta"
            ? "🧠"
            : textDelta.type === "text-delta"
            ? "🤖"
            : ""
        );
      }

      const fullText = await text;
      const responseTime = Date.now() - startTime;
      console.log(
        `\n✅ LLM clustering response completed (${fullText.length} chars, ${responseTime}ms)`
      );

      if (!fullText || fullText.trim().length === 0) {
        throw new Error("LLM returned empty response");
      }

      // Cache the response
      await llmCache.set(prompt, model, temperature, fullText, responseTime);

      // Parse clustering response
      const clusteringResponse = this.parser.parseClusteringResponse(fullText);

      // Validate response
      const validationErrors =
        this.parser.validateClusteringResponse(clusteringResponse);
      if (validationErrors.length > 0) {
        console.warn("⚠️ Clustering response validation issues:");
        validationErrors.forEach((error) => console.warn(`   ${error}`));
      }

      return clusteringResponse;
    } catch (error) {
      console.log("\n❌ LLM clustering request failed:", error);
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          throw new Error(
            "Invalid Google API key. Please check your GOOGLE_GENERATIVE_AI_API_KEY environment variable."
          );
        }
        if (
          error.message.includes("quota") ||
          error.message.includes("limit")
        ) {
          throw new Error(
            "API quota exceeded. Please check your Google API usage limits."
          );
        }
        if (error.message.includes("model")) {
          throw new Error(
            `Invalid model '${model}'. Please check if the model is available and correctly named.`
          );
        }
        throw new Error(`LLM API error: ${error.message}`);
      }
      throw error;
    }
  }

  private async getSourceContext(projectPath: string): Promise<string> {
    try {
      const tempDir = require("os").tmpdir();
      const outputFile = path.join(tempDir, `repomix-hybrid-${Date.now()}.xml`);

      const options: CliOptions = {
        output: outputFile,
        style: "xml",
        compress: true, // Use compression for source context
        quiet: true,
      };

      // Add timeout for source context gathering
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Source context gathering timed out")),
          15000
        )
      );

      await Promise.race([
        runCli([projectPath], process.cwd(), options),
        timeoutPromise,
      ]);

      if (!fs.existsSync(outputFile)) {
        console.warn(
          "⚠️ Could not generate source context, continuing without it"
        );
        return "";
      }

      const content = fs.readFileSync(outputFile, "utf-8");

      // Clean up temp file
      try {
        fs.unlinkSync(outputFile);
      } catch (error) {
        // Ignore cleanup errors
      }

      // Limit source context size to avoid overwhelming the LLM
      if (content.length > 50000) {
        // 50KB limit for source context
        console.warn(
          `⚠️ Source context is large (${Math.round(
            content.length / 1024
          )}KB), truncating...`
        );
        return (
          content.substring(0, 50000) +
          "\n\n[TRUNCATED - Source context was too large]"
        );
      }

      return content;
    } catch (error) {
      console.warn("⚠️ Failed to gather source context:", error.message);
      return "";
    }
  }

  async validateEnvironment(): Promise<{
    astAnalyzer: boolean;
    apiKey: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let astAnalyzerAvailable = true;
    let apiKeyAvailable = false;

    // Check AST analyzer (always available since it's built-in)
    // No need to check - TypeScript compiler is always available

    // Check API key
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      apiKeyAvailable = true;
    } else {
      issues.push(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set"
      );
    }

    return {
      astAnalyzer: astAnalyzerAvailable,
      apiKey: apiKeyAvailable,
      issues,
    };
  }

  getAvailableTemplates(): Array<{ name: string; description: string }> {
    return promptEngine
      .listTemplates()
      .filter((t) => t.name.startsWith("hybrid-"))
      .map((t) => ({
        name: t.name,
        description: t.description,
      }));
  }

  getAvailableModels(): string[] {
    return [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash-exp",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ];
  }
}
