
import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  handler: (args: any, context: any) => Promise<any>;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// Helper to convert Zod schema to JSON Schema for OpenAI
function zodToJsonSchema(schema: z.ZodSchema): any {
  // This is a simplified converter. For production, use zod-to-json-schema package
  // But since we can't install packages easily, we'll implement a basic one or assume
  // the schema is simple enough.
  // Actually, for robust ness, let's use a simplified approach where we construct the schema manually 
  // if we can't rely on a library, OR we try to import zod-to-json-schema if available.
  // Checking package.json... I didn't check if zod-to-json-schema is there.
  // I'll implement a basic converter for the standard types we use.
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];

    for (const key in shape) {
      const field = shape[key];
      properties[key] = zodToJsonSchema(field);
      if (!field.isOptional()) {
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      required
    };
  } else if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description };
  } else if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description };
  } else if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description };
  } else if (schema instanceof z.ZodArray) {
    return { 
      type: 'array', 
      items: zodToJsonSchema(schema.element as z.ZodSchema) 
    };
  }
  return { type: 'string' }; // Fallback
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolSchemas(): ToolSchema[] {
    // In a real app, we'd use zod-to-json-schema. 
    // Here we might need to rely on the tool definition providing the raw schema 
    // or use the simple converter.
    // For now, let's assume the parameters are passed as a JSON schema object directly
    // or we use the simple converter.
    
    // Let's modify ToolDefinition to accept a JSON schema directly for parameters
    // to avoid complex conversion logic without libraries.
    // Wait, the plan says "Use zod...".
    // I will try to use the Zod schema and a basic converter.
    
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters)
      }
    }));
  }

  async executeTool(name: string, args: any, context: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    
    // Validate args against schema
    const result = tool.parameters.safeParse(args);
    if (!result.success) {
      throw new Error(`Invalid arguments for tool ${name}: ${result.error.message}`);
    }

    return await tool.handler(result.data, context);
  }
}
