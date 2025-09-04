import { Logger } from '../logger.js';
import OpenAI from 'openai';

export interface CodexConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class CodexClient {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  
  constructor(
    private readonly log: Logger,
    config: CodexConfig = {}
  ) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    
    // Only require API key if not using Codex CLI
    const useCodexCLI = process.env.USE_CODEX_CLI === 'true';
    if (!apiKey && !useCodexCLI) {
      throw new Error('OPENAI_API_KEY is required when not using Codex CLI');
    }
    
    // Only initialize OpenAI client if we have an API key
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      // Create a dummy client for CLI mode
      this.openai = null as any;
    }
    
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-5';
    this.temperature = config.temperature ?? 0.1;
    this.maxTokens = config.maxTokens ?? 2000;
    
    this.log.info('codex.client.initialized', {
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens
    });
  }
  
  async complete(prompt: string, options: Partial<CodexConfig> = {}): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Use Codex CLI mode instead.');
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: options.model || this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant. Provide concise and accurate code completions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens,
      });
      
      const content = response.choices[0]?.message?.content || '';
      this.log.debug('codex.complete.success', { 
        promptLength: prompt.length, 
        responseLength: content.length 
      });
      
      return content;
    } catch (error) {
      this.log.error('codex.complete.error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
  
  async suggest(
    code: string, 
    cursor: { line: number; column: number },
    language?: string
  ): Promise<string[]> {
    try {
      const prompt = this.buildSuggestionPrompt(code, cursor, language);
      const response = await this.complete(prompt, { temperature: 0.3 });
      
      // Parse suggestions from response
      const suggestions = this.parseSuggestions(response);
      
      this.log.debug('codex.suggest.success', {
        cursor,
        language,
        suggestionCount: suggestions.length
      });
      
      return suggestions;
    } catch (error) {
      this.log.error('codex.suggest.error', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
  
  private buildSuggestionPrompt(
    code: string,
    cursor: { line: number; column: number },
    language?: string
  ): string {
    const lines = code.split('\n');
    const currentLine = lines[cursor.line - 1] || '';
    const prefix = currentLine.substring(0, cursor.column);
    
    const context = lines.slice(Math.max(0, cursor.line - 10), cursor.line).join('\n');
    
    return `Language: ${language || 'auto-detect'}
Context:
${context}

Current line prefix: ${prefix}

Provide 3 possible completions for the current line. Format each suggestion on a new line starting with "- ".`;
  }
  
  private parseSuggestions(response: string): string[] {
    const lines = response.split('\n');
    const suggestions = lines
      .filter(line => line.trim().startsWith('- '))
      .map(line => line.substring(2).trim())
      .filter(s => s.length > 0);
    
    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }
  
  async explain(code: string, language?: string): Promise<string> {
    const prompt = `Explain the following ${language || ''} code in a clear and concise manner:

\`\`\`${language || ''}
${code}
\`\`\`

Provide a brief explanation focusing on what the code does and how it works.`;
    
    return this.complete(prompt, { temperature: 0.3 });
  }
  
  async refactor(code: string, instruction: string, language?: string): Promise<string> {
    const prompt = `Refactor the following ${language || ''} code according to this instruction: ${instruction}

Original code:
\`\`\`${language || ''}
${code}
\`\`\`

Provide only the refactored code without explanations.`;
    
    return this.complete(prompt, { temperature: 0.2 });
  }
}
