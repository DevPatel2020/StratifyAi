import type { QuestionType, Template } from '@shared/types'

const t = (slug: string, name: string, description: string, steps: string[], questionTypes: QuestionType[]): Template => ({
  id: `builtin:${slug}`,
  name,
  description,
  steps,
  questionTypes,
  builtin: true
})

/**
 * Library of well-known thinking frameworks. The path generator picks the ones that fit the
 * classified question type and asks the LLM to adapt their steps to the user's actual question.
 */
export const BUILTIN_TEMPLATES: Template[] = [
  t('first-principles', 'First Principles', 'Strip the problem to fundamental truths and rebuild from there.',
    ['List assumptions and identify the fundamental truths', 'Break the problem into its basic components', 'Rebuild a solution from the fundamentals'],
    ['business_strategy', 'research', 'learning', 'creative', 'coding']),
  t('five-whys', '5 Whys', 'Ask "why" repeatedly to reach the root cause.',
    ['State the problem precisely', 'Ask "why" iteratively to trace causes', 'Identify the root cause and a countermeasure'],
    ['coding', 'data_analysis', 'business_strategy', 'personal_planning']),
  t('swot', 'SWOT Analysis', 'Strengths, weaknesses, opportunities and threats.',
    ['Identify internal strengths and weaknesses', 'Identify external opportunities and threats', 'Derive strategic options from the SWOT matrix'],
    ['business_strategy', 'decision_making', 'personal_planning']),
  t('pros-cons', 'Pros & Cons', 'Weigh the advantages and disadvantages of each option.',
    ['Define the options and decision criteria', 'List and weight the pros and cons of each option', 'Compare scores and recommend an option'],
    ['decision_making', 'personal_planning', 'business_strategy']),
  t('six-hats', 'Six Thinking Hats', "De Bono's parallel thinking: facts, feelings, risks, benefits, ideas, process.",
    ['Gather facts (white) and gut feelings (red)', 'Weigh risks (black) against benefits (yellow)', 'Generate alternatives (green) and plan next moves (blue)'],
    ['decision_making', 'creative', 'business_strategy']),
  t('root-cause', 'Root Cause Debugging', 'Reproduce, isolate and fix the underlying defect.',
    ['Reproduce the issue and collect evidence', 'Isolate the faulty component with hypotheses', 'Fix the root cause and verify with tests'],
    ['coding', 'data_analysis']),
  t('design-thinking', 'Design Thinking', 'Empathise, define, ideate, prototype.',
    ['Empathise with users and define the core problem', 'Ideate a wide range of solutions', 'Prototype and plan how to test the best idea'],
    ['creative', 'business_strategy', 'coding']),
  t('feynman', 'Feynman Technique', 'Learn by explaining in simple words and filling gaps.',
    ['Explain the concept in plain language', 'Identify gaps and confusing parts', 'Refine with analogies and a worked example'],
    ['learning', 'research']),
  t('socratic', 'Socratic Questioning', 'Probe assumptions, evidence and implications.',
    ['Clarify the question and its assumptions', 'Examine the evidence and alternative viewpoints', 'Explore implications and consequences'],
    ['learning', 'research', 'decision_making']),
  t('data-driven', 'Data-Driven Analysis', 'Let the data guide the conclusions.',
    ['Define metrics and gather relevant data', 'Analyse patterns, segments and anomalies', 'Draw conclusions and recommend actions'],
    ['data_analysis', 'business_strategy', 'research']),
  t('scenario', 'Scenario Planning', 'Explore best, worst and likely futures.',
    ['Identify key drivers and uncertainties', 'Build best, worst and most-likely scenarios', 'Define robust actions for all scenarios'],
    ['business_strategy', 'decision_making', 'personal_planning']),
  t('cost-benefit', 'Cost-Benefit Analysis', 'Quantify costs and benefits before deciding.',
    ['List all costs and benefits', 'Estimate their value and timing', 'Compute net value and make a recommendation'],
    ['decision_making', 'business_strategy']),
  t('mvp', 'Rapid Prototype', 'Build the smallest working version and iterate.',
    ['Define the minimal viable version', 'Build and test the core functionality', 'Iterate based on feedback'],
    ['coding', 'creative', 'business_strategy']),
  t('literature', 'Literature Review', 'Survey what is known before concluding.',
    ['Define scope and key questions', 'Summarise existing knowledge and sources', 'Identify gaps and synthesise findings'],
    ['research', 'learning']),
  t('smart-goals', 'SMART Planning', 'Turn intentions into specific, measurable plans.',
    ['Define a Specific, Measurable goal', 'Check it is Achievable, Relevant and Time-bound', 'Break it into a weekly action plan'],
    ['personal_planning', 'learning']),
  t('analytical', 'Analytical Breakdown', 'Decompose, examine and synthesise.',
    ['Break the question into components', 'Examine each component in depth', 'Synthesise the insights into an answer'],
    ['coding', 'data_analysis', 'business_strategy', 'learning', 'decision_making', 'creative', 'research', 'personal_planning'])
]

/** Pick candidate frameworks for a question type (relevant ones first, then the generic one). */
export function candidateFrameworks(type: QuestionType, all: Template[], max = 7): Template[] {
  const relevant = all.filter((f) => f.questionTypes.includes(type))
  const rest = all.filter((f) => !f.questionTypes.includes(type))
  return [...relevant, ...rest].slice(0, max)
}
