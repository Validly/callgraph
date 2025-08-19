import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheEntry {
  prompt: string;
  model: string;
  temperature: number;
  response: string;
  timestamp: number;
  responseTime: number; // milliseconds
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  avgResponseTime: number;
  totalSizeKB: number;
  oldestEntry: number;
  newestEntry: number;
}

export class LLMCache {
  private cacheDir: string;
  private hits: number = 0;
  private misses: number = 0;
  private enabled: boolean = true;

  constructor(cacheDir: string = '.llm-cache') {
    this.cacheDir = path.resolve(cacheDir);
    this.ensureCacheDirectory();
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`📁 Created LLM cache directory: ${this.cacheDir}`);
    }
  }

  private generateCacheKey(prompt: string, model: string, temperature: number): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${prompt}::${model}::${temperature}`)
      .digest('hex');
    return hash.substring(0, 16); // Use first 16 characters for shorter filenames
  }

  private getCachePath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  async get(prompt: string, model: string, temperature: number): Promise<string | null> {
    if (!this.enabled) return null;

    const cacheKey = this.generateCacheKey(prompt, model, temperature);
    const cachePath = this.getCachePath(cacheKey);

    try {
      if (!fs.existsSync(cachePath)) {
        this.misses++;
        return null;
      }

      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry;
      
      // Validate cache entry
      if (
        cacheData.prompt === prompt &&
        cacheData.model === model &&
        cacheData.temperature === temperature
      ) {
        this.hits++;
        console.log(`🎯 Cache hit for ${model} query (key: ${cacheKey})`);
        return cacheData.response;
      } else {
        // Cache collision or corruption, remove invalid entry
        fs.unlinkSync(cachePath);
        this.misses++;
        return null;
      }
    } catch (error) {
      console.warn(`⚠️  Cache read error for key ${cacheKey}:`, error.message);
      // Remove corrupted cache file
      try {
        if (fs.existsSync(cachePath)) {
          fs.unlinkSync(cachePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      this.misses++;
      return null;
    }
  }

  async set(
    prompt: string,
    model: string,
    temperature: number,
    response: string,
    responseTime: number
  ): Promise<void> {
    if (!this.enabled) return;

    const cacheKey = this.generateCacheKey(prompt, model, temperature);
    const cachePath = this.getCachePath(cacheKey);

    const cacheEntry: CacheEntry = {
      prompt,
      model,
      temperature,
      response,
      timestamp: Date.now(),
      responseTime,
    };

    try {
      fs.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
      console.log(`💾 Cached ${model} response (key: ${cacheKey}, ${responseTime}ms)`);
    } catch (error) {
      console.warn(`⚠️  Cache write error for key ${cacheKey}:`, error.message);
    }
  }

  getStats(): CacheStats {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      return {
        totalEntries: 0,
        hitRate: 0,
        avgResponseTime: 0,
        totalSizeKB: 0,
        oldestEntry: 0,
        newestEntry: 0,
      };
    }

    let totalSize = 0;
    let totalResponseTime = 0;
    let oldestEntry = Number.MAX_SAFE_INTEGER;
    let newestEntry = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;

      try {
        const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheEntry;
        totalResponseTime += cacheData.responseTime;
        oldestEntry = Math.min(oldestEntry, cacheData.timestamp);
        newestEntry = Math.max(newestEntry, cacheData.timestamp);
      } catch (error) {
        // Skip corrupted files
      }
    }

    const totalRequests = this.hits + this.misses;
    
    return {
      totalEntries: files.length,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
      avgResponseTime: files.length > 0 ? totalResponseTime / files.length : 0,
      totalSizeKB: Math.round(totalSize / 1024),
      oldestEntry,
      newestEntry,
    };
  }

  clear(): void {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    let cleared = 0;

    for (const file of files) {
      try {
        fs.unlinkSync(path.join(this.cacheDir, file));
        cleared++;
      } catch (error) {
        console.warn(`⚠️  Failed to delete cache file ${file}:`, error.message);
      }
    }

    console.log(`🗑️  Cleared ${cleared} cache entries`);
    this.hits = 0;
    this.misses = 0;
  }

  clearOlderThan(daysOld: number): void {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    let cleared = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      
      try {
        const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheEntry;
        if (cacheData.timestamp < cutoffTime) {
          fs.unlinkSync(filePath);
          cleared++;
        }
      } catch (error) {
        // Remove corrupted files too
        try {
          fs.unlinkSync(filePath);
          cleared++;
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }

    console.log(`🗑️  Cleared ${cleared} old cache entries (older than ${daysOld} days)`);
  }

  disable(): void {
    this.enabled = false;
    console.log('🚫 LLM cache disabled');
  }

  enable(): void {
    this.enabled = true;
    this.ensureCacheDirectory();
    console.log('✅ LLM cache enabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  printStats(): void {
    const stats = this.getStats();
    console.log('\n📊 LLM Cache Statistics:');
    console.log(`   Entries: ${stats.totalEntries}`);
    console.log(`   Hit rate: ${stats.hitRate.toFixed(1)}%`);
    console.log(`   Avg response time: ${stats.avgResponseTime.toFixed(0)}ms`);
    console.log(`   Total size: ${stats.totalSizeKB}KB`);
    
    if (stats.oldestEntry > 0) {
      const oldestDate = new Date(stats.oldestEntry).toLocaleString();
      const newestDate = new Date(stats.newestEntry).toLocaleString();
      console.log(`   Oldest entry: ${oldestDate}`);
      console.log(`   Newest entry: ${newestDate}`);
    }
    console.log();
  }
}

// Global cache instance
export const llmCache = new LLMCache();