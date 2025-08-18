import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface GraphvizOptions {
  format?: 'svg' | 'png' | 'pdf' | 'json';
  outputPath?: string;
}

/**
 * Handles Graphviz command execution for various output formats
 */
export class GraphvizRenderer {
  
  /**
   * Generate SVG from DOT content
   */
  async generateSVG(dotPath: string, svgPath: string): Promise<void> {
    try {
      await execAsync(`dot -Tsvg "${dotPath}" -o "${svgPath}"`);
      console.log(`   ✅ Generated: ${svgPath}`);
    } catch (error: any) {
      console.error(`   ❌ Error generating SVG: ${error.message}`);
      console.log(`   💡 Make sure Graphviz is installed: apt-get install graphviz (or brew install graphviz on macOS)`);
      throw error;
    }
  }

  /**
   * Generate SVG from DOT content (alternative method)
   */
  async renderDotToSVG(dotContent: string, outputPath: string): Promise<void> {
    try {
      // Create temporary DOT file if needed, or use stdin
      const command = `echo '${dotContent.replace(/'/g, "'\\''")}' | dot -Tsvg > "${outputPath}"`;
      await execAsync(command);
      console.log(`   ✅ Generated: ${outputPath}`);
    } catch (error: any) {
      console.error(`   ❌ Error generating SVG: ${error.message}`);
      console.log(`   💡 Make sure Graphviz is installed: apt-get install graphviz (or brew install graphviz on macOS)`);
      throw error;
    }
  }

  /**
   * Execute Graphviz command and return output
   */
  async executeGraphviz(dotContent: string, format: string = 'json'): Promise<string> {
    return new Promise((resolve, reject) => {
      const child_process = require('child_process');
      const child = child_process.spawn('dot', [`-T${format}`]);
      
      let output = '';
      let error = '';
      
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data: Buffer) => {
        error += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`Graphviz failed with code ${code}: ${error}`));
          return;
        }
        resolve(output);
      });
      
      // Send DOT content to stdin
      child.stdin.write(dotContent);
      child.stdin.end();
    });
  }

  /**
   * Generate multiple formats from a single DOT file
   */
  async generateMultipleFormats(dotPath: string, formats: string[], outputDir?: string): Promise<string[]> {
    const results: string[] = [];
    const dir = outputDir || path.dirname(dotPath);
    const baseName = path.basename(dotPath, '.dot');

    for (const format of formats) {
      const outputPath = path.join(dir, `${baseName}.${format}`);
      try {
        await execAsync(`dot -T${format} "${dotPath}" -o "${outputPath}"`);
        console.log(`   ✅ Generated ${format.toUpperCase()}: ${outputPath}`);
        results.push(outputPath);
      } catch (error: any) {
        console.error(`   ❌ Error generating ${format.toUpperCase()}: ${error.message}`);
        throw error;
      }
    }

    return results;
  }
}