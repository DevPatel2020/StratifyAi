import OpenAI, { toFile } from 'openai'

/** Speech-to-text with Groq's hosted Whisper (free tier, same GROQ_API_KEY). */
export async function transcribe(audio: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY || '').trim()
  if (!apiKey) throw new Error('Voice input needs GROQ_API_KEY (Groq Whisper) in .env')
  const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
  const file = await toFile(Buffer.from(audio), `speech.${ext}`, { type: mimeType })
  const res = await client.audio.transcriptions.create({
    file,
    model: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo'
  })
  return res.text.trim()
}
