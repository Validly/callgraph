import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { runCli, type CliOptions } from 'repomix';
import type { CallGraph } from './types.js';
import { promptEngine, type PromptVariables } from './prompt-templates.js';
import { LLMResponseParser } from './llm-response-parser.js';
import { llmCache } from './llm-cache.js';

export interface LLMVibeAnalyzerOptions {
  templateName?: string;
  customPrompt?: string;
  model?: string;
  temperature?: number;
  promptVariables?: PromptVariables;
}

export class LLMVibeAnalyzer {
  private parser: LLMResponseParser;
  private tempDir: string;

  constructor() {
    this.parser = new LLMResponseParser();
    this.tempDir = os.tmpdir();
  }

  async analyze(projectPath: string, options: LLMVibeAnalyzerOptions = {}): Promise<CallGraph> {
    const {
      templateName = 'callgraph-basic',
      customPrompt,
      model = 'gemini-2.5-flash',
      temperature = 0.1,
      promptVariables = {}
    } = options;

    console.log('📦 Packing project with Repomix...');
    const packedContent = await this.packProject(projectPath);
    console.log(`📦 Packed content size: ${packedContent.length} characters`);

    console.log('🧠 Analyzing with LLM...');
    const prompt = customPrompt || this.buildPrompt(templateName, projectPath, packedContent, promptVariables);

    const response = await this.queryLLM(prompt, model, temperature);

    console.log('📊 Parsing LLM response...');
    const callGraph = this.parser.parseCallGraph(response);

    this.cleanupTempFiles();

    return callGraph;
  }

  private async packProject(projectPath: string): Promise<string> {
    const outputFile = path.join(this.tempDir, `repomix-${Date.now()}.xml`);

    try {
      const options: CliOptions = {
        output: outputFile,
        style: 'xml',
        compress: false,
        quiet: true
      };

      // Add timeout and memory handling
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Repomix operation timed out')), 30000)
      );

      await Promise.race([
        runCli([projectPath], process.cwd(), options),
        timeoutPromise
      ]);

      if (!fs.existsSync(outputFile)) {
        throw new Error(`Repomix output file not created: ${outputFile}`);
      }

      const content = fs.readFileSync(outputFile, 'utf-8');

      if (content.length === 0) {
        throw new Error('Repomix produced empty output');
      }

      if (content.length > 2000000) { // 2MB limit
        console.warn(`⚠️  Large project detected (${Math.round(content.length / 1024)}KB). Consider using filters or analyzing specific directories.`);
        return content.substring(0, 2000000) + '\n\n[TRUNCATED - Project too large for full analysis]';
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to pack project with Repomix: ${error.message}`);
      }
      throw error;
    }
  }

  private buildPrompt(templateName: string, projectPath: string, sourceCode: string, additionalVariables: PromptVariables): string {
    const template = promptEngine.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found. Available templates: ${promptEngine.listTemplates().map(t => t.name).join(', ')}`);
    }

    const projectName = path.basename(projectPath);
    const variables: PromptVariables = {
      projectName,
      sourceCode,
      analysisGoal: 'Generate a comprehensive call graph for code analysis',
      debugTarget: 'execution flow and function relationships',
      ...additionalVariables
    };

    return promptEngine.renderTemplate(templateName, variables);
  }

  private async queryLLM(prompt: string, model: string, temperature: number): Promise<string> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log(`🔑 API Key status: ${apiKey ? 'Present' : 'Missing'} (length: ${apiKey?.length || 0})`);
    console.log(`🤖 Using model: ${model}, temperature: ${temperature}`);
    console.log(`📝 Prompt length: ${prompt.length} characters`);

    // Check cache first
    const cachedResponse = await llmCache.get(prompt, model, temperature);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (!apiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set. Please set it to use the LLM analyzer.');
    }

    try {
      console.log('📡 Sending request to LLM (streaming)...');
      const startTime = Date.now();
      const {fullStream, text} = streamText({
        model: google(model),
        prompt,
        temperature
      });

      // Stream main text content
      console.log('💭 Streaming response...');
      for await (const textDelta of fullStream) {
        process.stdout.write('text' in textDelta && textDelta.text.length > 50 ? '█' : '▓'); // Show progress
      }

      const fullText = await text;
      const responseTime = Date.now() - startTime;

      console.log(`\n✅ LLM response completed (${fullText.length} chars, ${responseTime}ms)`);

      if (!fullText || fullText.trim().length === 0) {
        throw new Error('LLM returned empty response');
      }

      // Cache the response
      await llmCache.set(prompt, model, temperature, fullText, responseTime);

      return fullText;
    } catch (error) {
      console.log('\n❌ LLM request failed:', error);
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw new Error('Invalid Google API key. Please check your GOOGLE_GENERATIVE_AI_API_KEY environment variable.');
        }
        if (error.message.includes('quota') || error.message.includes('limit')) {
          throw new Error('API quota exceeded. Please check your Google API usage limits.');
        }
        if (error.message.includes('model')) {
          throw new Error(`Invalid model '${model}'. Please check if the model is available and correctly named.`);
        }
        throw new Error(`LLM API error: ${error.message}`);
      }
      throw error;
    }
  }

  private cleanupTempFiles(): void {
    try {
      const tempFiles = fs.readdirSync(this.tempDir)
        .filter(file => file.startsWith('repomix-') && file.endsWith('.xml'))
        .map(file => path.join(this.tempDir, file));

      for (const file of tempFiles) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  getAvailableTemplates(): Array<{name: string; description: string}> {
    return promptEngine.listTemplates().map(t => ({
      name: t.name,
      description: t.description
    }));
  }

  getAvailableModels(): string[] {
    return [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  async validateEnvironment(): Promise<{repomix: boolean; apiKey: boolean; issues: string[]}> {
    const issues: string[] = [];
    let repomixAvailable = false;
    let apiKeyAvailable = false;

    try {
      // Test repomix library by trying to import it
      await import('repomix');
      repomixAvailable = true;
    } catch (error) {
      issues.push('Repomix library is not available. Install with: npm install repomix');
    }

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      apiKeyAvailable = true;
    } else {
      issues.push('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set');
    }

    return { repomix: repomixAvailable, apiKey: apiKeyAvailable, issues };
  }
}