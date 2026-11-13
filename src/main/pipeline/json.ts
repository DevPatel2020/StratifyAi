import type { z, ZodTypeAny } from 'zod'

/** Extract the first JSON object from model text (handles ```json fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output')
  return JSON.parse(candidate.slice(start, end + 1))
}

/** Parse model output with a zod schema; returns the schema's output type (defaults applied). */
export function parseWith<S extends ZodTypeAny>(schema: S, text: string): z.output<S> {
  return schema.parse(extractJson(text))
}
