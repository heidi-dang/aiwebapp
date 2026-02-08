import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

// Mock skills data for now - in real implementation these would come from runner
const mockSkills = [
  {
    name: 'coding',
    description: 'Software development and code analysis skills',
    systemPrompt: 'You are an expert software developer. Follow best practices and clean code principles.'
  },
  {
    name: 'web_search',
    description: 'Web search and information retrieval skills',
    systemPrompt: 'You have access to web search capabilities. Use specific search terms and evaluate sources.'
  },
  {
    name: 'data_analysis',
    description: 'Data analysis and visualization skills',
    systemPrompt: 'You are skilled in data analysis. Clean data, use appropriate methods, and provide insights.'
  }
]

export async function registerSkillsRoutes(app: Express, store: Store) {
  app.get('/skills', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    res.json(mockSkills.map(skill => ({
      name: skill.name,
      description: skill.description,
      systemPrompt: skill.systemPrompt
    })))
  })

  app.get('/skills/:name', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const skill = mockSkills.find(s => s.name === req.params.name)
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' })
      return
    }
    
    res.json({
      name: skill.name,
      description: skill.description,
      systemPrompt: skill.systemPrompt,
      tools: [] // Would come from actual skill implementation
    })
  })
}