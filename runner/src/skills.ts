import { ToolRegistry } from './tools.js'
import type { ToolDefinition } from './tools.js'
import type { AgentMemory } from './agent_base.js'

export interface SkillConfig {
  name: string
  description: string
  systemPrompt?: string
  tools?: ToolDefinition[]
  memoryHandlers?: {
    onStore?: (memory: AgentMemory) => void | Promise<void>
    onRetrieve?: (memory: AgentMemory) => AgentMemory | Promise<AgentMemory>
  }
}

export class Skill {
  readonly name: string
  readonly description: string
  readonly systemPrompt: string
  protected tools: ToolRegistry
  protected memoryHandlers?: SkillConfig['memoryHandlers']

  constructor(config: SkillConfig) {
    this.name = config.name
    this.description = config.description
    this.systemPrompt = config.systemPrompt || ''
    this.tools = new ToolRegistry()
    this.memoryHandlers = config.memoryHandlers

    if (config.tools) {
      for (const tool of config.tools) {
        this.tools.registerTool(tool)
      }
    }
  }

  getSystemPrompt(): string {
    return this.systemPrompt
  }

  getTools(): ToolRegistry {
    return this.tools
  }

  async enhanceMemory(memory: AgentMemory): Promise<AgentMemory> {
    if (this.memoryHandlers?.onRetrieve) {
      return await this.memoryHandlers.onRetrieve(memory)
    }
    return memory
  }

  async storeMemory(memory: AgentMemory): Promise<void> {
    if (this.memoryHandlers?.onStore) {
      await this.memoryHandlers.onStore(memory)
    }
  }
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map()

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill)
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  getCombinedSystemPrompt(): string {
    const prompts: string[] = []
    for (const skill of this.skills.values()) {
      if (skill.getSystemPrompt()) {
        prompts.push(`## ${skill.name}\n${skill.getSystemPrompt()}`)
      }
    }
    return prompts.join('\n\n')
  }

  getAllTools(): ToolRegistry {
    const combinedRegistry = new ToolRegistry()
    for (const skill of this.skills.values()) {
      const tools = skill.getTools()
      for (const tool of tools.getTools()) {
        combinedRegistry.registerTool(tool)
      }
    }
    return combinedRegistry
  }

  async enhanceMemory(memory: AgentMemory): Promise<AgentMemory> {
    let enhancedMemory = memory
    for (const skill of this.skills.values()) {
      enhancedMemory = await skill.enhanceMemory(enhancedMemory)
    }
    return enhancedMemory
  }
}

// Pre-built skills
export class CodingSkill extends Skill {
  constructor() {
    super({
      name: 'coding',
      description: 'Software development and code analysis skills',
      systemPrompt: `You are an expert software developer. When writing code:
- Follow best practices and clean code principles
- Add appropriate comments and documentation
- Write tests for new functionality
- Consider security implications
- Use consistent naming conventions
- Optimize for readability and maintainability`,
      tools: [
        // Code-specific tools would be added here
      ]
    })
  }
}

export class WebSearchSkill extends Skill {
  constructor() {
    super({
      name: 'web_search',
      description: 'Web search and information retrieval skills',
      systemPrompt: `You have access to web search capabilities. When searching:
- Use specific and relevant search terms
- Evaluate source credibility
- Synthesize information from multiple sources
- Provide citations when possible
- Focus on recent and authoritative sources`
    })
  }
}

export class DataAnalysisSkill extends Skill {
  constructor() {
    super({
      name: 'data_analysis',
      description: 'Data analysis and visualization skills',
      systemPrompt: `You are skilled in data analysis. When working with data:
- Clean and validate data before analysis
- Use appropriate statistical methods
- Create clear visualizations
- Explain findings in business terms
- Suggest actionable insights`
    })
  }
}