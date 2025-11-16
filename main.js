require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');

// Suppress GPU-related warnings on Windows
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hidden',
    frame: false,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets/icon.png') // Optional: add an icon
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// ===== Window control IPC =====
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ===== Gemini client helper =====
async function callGemini(promptText, maxOutputTokens = 1024) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || '').trim();

  if (!apiKey || apiKey === 'your_api_key_here') {
    return {
      ok: false,
      text: '',
      error: 'Gemini API key not found. Please set GEMINI_API_KEY (or GROQ_API_KEY) in your .env file.'
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }]
          }
        ],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.8,
          topP: 0.9
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const candidates = response.data.candidates || [];
    const first = candidates[0] || {};
    const parts = (first.content && first.content.parts) || [];
    const text = parts.map(p => p.text || '').join('').trim();

    if (!text) {
      return {
        ok: false,
        text: '',
        error: 'Gemini response contained no text.'
      };
    }

    return { ok: true, text };
  } catch (error) {
    const statusCode = error.response?.status || 'N/A';
    const errorMessage =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      'Unknown error';

    return {
      ok: false,
      text: '',
      error: `Gemini API Error (${statusCode}): ${errorMessage}`
    };
  }
}

// ===== Simple connectivity check (used by status pill) =====
ipcMain.handle('send-to-llm', async (event, message) => {
  const result = await callGemini(message || 'ping', 128);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true, response: result.text };
});

// ===== Thinking paths: generate new paths for a query =====
ipcMain.handle('generate-thinking-paths', async (event, query) => {
  const prompt = `You are a strategic thinking assistant. For the following query: "${query}"

Generate 4 different thinking approaches/paths to solve this. For each path, provide:
1. A clear approach name (2-4 words)
2. Exactly 3 specific thinking steps for that approach
3. Each step should be a concrete action or analysis

Respond ONLY with valid JSON:
{
  "paths": [
    {
      "name": "Approach Name",
      "steps": ["Step 1 description", "Step 2 description", "Step 3 description"]
    }
  ]
}

Make the paths genuinely different approaches, not just variations. Think like a consultant presenting multiple strategies.`;

  const result = await callGemini(prompt, 2048);

  if (!result.ok) {
    return {
      success: false,
      paths: generateFallbackPaths(query).paths,
      error: result.error
    };
  }

  try {
    const text = result.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Gemini output.');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      paths: parsed.paths || []
    };
  } catch (err) {
    return {
      success: false,
      paths: generateFallbackPaths(query).paths,
      error: `Failed to parse thinking paths JSON: ${err.message}`
    };
  }
});

// ===== Thinking paths: auto-continue based on conversation =====
ipcMain.handle('generate-updated-paths', async (event, { originalQuery, lastResponse, conversationContext, lastPathName, lastStepsExecuted }) => {
  const prompt = `Based on this conversation context:

Original Question: "${originalQuery}"
Last Approach Used: "${lastPathName}" (executed ${lastStepsExecuted} steps)
Latest Response (truncated): "${(lastResponse || '').substring(0, 500)}..."

Generate 4 NEW thinking approaches that logically continue from where we left off. These should:
1. Build on the insights already gained
2. Offer different perspectives or deeper exploration
3. Represent the next logical steps in the thinking process
4. Propose alternative directions to explore

For each path, provide:
  - "name": 2-4 word approach name
  - "steps": exactly 3 specific next thinking steps

Respond ONLY with valid JSON in this shape:
{
  "paths": [
    {
      "name": "Approach Name",
      "steps": ["Step 1", "Step 2", "Step 3"]
    }
  ]
}`;

  const result = await callGemini(prompt, 768);

  if (!result.ok) {
    return {
      success: false,
      paths: generateContinuationPaths(lastPathName, lastStepsExecuted).paths,
      error: result.error
    };
  }

  try {
    const text = result.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Gemini output.');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      paths: parsed.paths || []
    };
  } catch (err) {
    return {
      success: false,
      paths: generateContinuationPaths(lastPathName, lastStepsExecuted).paths,
      error: `Failed to parse continuation paths JSON: ${err.message}`
    };
  }
});

// ===== Execute a specific thinking path up to a step =====
ipcMain.handle('execute-thinking-path', async (event, { query, pathName, steps, executeUpToStep }) => {
  let prompt = `Original question: "${query}"\n\nI'm following the "${pathName}" approach. I will execute these steps and structure my response to show my thinking process:\n\n`;

  for (let i = 0; i < executeUpToStep; i++) {
    prompt += `Step ${i + 1}: ${steps[i]}\n`;
  }

  prompt += `\nIMPORTANT: You must think through and execute ONLY the ${executeUpToStep} step${executeUpToStep > 1 ? 's' : ''} listed above. Do NOT go beyond these steps or provide a complete solution.

Structure your response exactly like this format:

**Following "${pathName}" Approach:**

**Step 1: ${steps[0] || 'First Step'}**
[Think through and execute this specific step. Provide your actual reasoning, analysis, and findings for JUST this step. Be detailed but focused only on this step's scope.]

${executeUpToStep > 1 ? `**Step 2: ${steps[1] || 'Second Step'}**
[Now execute step 2, building on step 1. Show your thinking process for this specific step. What new insights emerge? How does this advance from step 1?]` : ''}

${executeUpToStep > 2 ? `**Step 3: ${steps[2] || 'Third Step'}**
[Execute the final step. Complete your analysis up to this point. What conclusions can you draw from steps 1-3?]` : ''}

**Current Progress:**
[Summarize what you've accomplished in these ${executeUpToStep} step${executeUpToStep > 1 ? 's' : ''}. Note what still needs to be explored in future steps.]

REMEMBER: Only execute the steps you're asked to. Don't provide a complete answer - just show your thinking for the specified steps. Use **bold text** for important terms and bullet points for clarity.`;

  const result = await callGemini(prompt, 4096);

  if (!result.ok) {
    return {
      success: false,
      error: result.error
    };
  }

  return {
    success: true,
    response: result.text,
    pathName,
    stepsExecuted: executeUpToStep
  };
});

// ===== Execute selected steps (non-sequential allowed) =====
ipcMain.handle('execute-thinking-steps', async (event, { query, pathName, steps, selectedSteps }) => {
  try {
    if (!Array.isArray(selectedSteps) || selectedSteps.length === 0) {
      return { success: false, error: 'No steps selected.' };
    }

    const ordered = [...new Set(selectedSteps)].sort((a, b) => a - b);

    const stepsBlocks = ordered.map(n => {
      const title = steps[(n - 1)] || `Step ${n}`;
      return `**Step ${n}: ${title}**
[Execute this step. Show your thinking process specifically for this step. Reference earlier context if needed, but DO NOT execute unselected steps.]`;
    }).join('\n\n');

  const prompt = `You are a strategic thinking assistant.

  User Question: "${query}"
  Approach Selected: "${pathName}"

  Execute ONLY the following selected steps. Do not discuss or propose any unselected steps:

  ${stepsBlocks}
  
  Provide only the results and reasoning for the selected steps. Do not add a "Next Potential Steps" section or mention future steps.`;

    const result = await callGemini(prompt, 4096);

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      response: result.text,
      pathName,
      selectedSteps: ordered
    };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error during selected steps execution.' };
  }
});

// ===== CSV analysis MVP =====
ipcMain.handle('analyze-csv', async (event, { fileName, csvText }) => {
  try {
    if (!csvText || typeof csvText !== 'string') {
      return { success: false, error: 'Empty or invalid CSV content.' };
    }

    const MAX_CHARS = 8000;
    const trimmed = csvText.length > MAX_CHARS ? csvText.slice(0, MAX_CHARS) : csvText;

    const prompt = `You are a senior data analyst inside a desktop tool called "StratifyAI".
The user has uploaded a SMALL CSV file. Here is the raw text sample (first lines):

---CSV START---
${trimmed}
---CSV END---

1) Quickly sanity-check the data (columns, types, missing values, obvious issues).
2) Give a HIGH-LEVEL SUMMARY of what this dataset seems to represent.
3) Provide 6-10 specific, insight-style bullet points (trends, segments, anomalies, comparisons).
4) Then generate 5-10 SMART follow-up questions the user could ask StratifyAI about this dataset later.

Format everything in clean Markdown with headings, bullet points and short subheadings. Be detailed and helpful but stay within 800-1000 words.`;

    const result = await callGemini(prompt, 4096);

    if (!result.ok) {
      return { success: false, error: result.error || 'No analysis returned from the model.' };
    }

    return {
      success: true,
      text: result.text
    };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error while analyzing CSV.' };
  }
});

// ===== Fallback path generators =====
function generateFallbackPaths(query) {
  const lower = (query || '').toLowerCase();
  const isCodeRelated = lower.includes('code') || lower.includes('program') || lower.includes('function');
  const isAnalysisRelated = lower.includes('analyz') || lower.includes('data') || lower.includes('research');

  if (isCodeRelated) {
    return {
      paths: [
        {
          name: "Step by Step",
          steps: ["Break down requirements", "Design the algorithm", "Implement and test"]
        },
        {
          name: "Best Practices",
          steps: ["Research existing solutions", "Apply design patterns", "Optimize for performance"]
        },
        {
          name: "Quick Prototype",
          steps: ["Create minimal version", "Test core functionality", "Iterate and improve"]
        },
        {
          name: "Comprehensive",
          steps: ["Plan architecture", "Implement with documentation", "Add error handling"]
        }
      ]
    };
  } else if (isAnalysisRelated) {
    return {
      paths: [
        {
          name: "Data Driven",
          steps: ["Gather relevant data", "Analyze patterns", "Draw conclusions"]
        },
        {
          name: "Comparative",
          steps: ["Identify alternatives", "Compare pros and cons", "Recommend best option"]
        },
        {
          name: "Root Cause",
          steps: ["Identify the problem", "Trace underlying causes", "Propose solutions"]
        },
        {
          name: "Strategic",
          steps: ["Define objectives", "Evaluate resources", "Create action plan"]
        }
      ]
    };
  } else {
    return {
      paths: [
        {
          name: "Analytical",
          steps: ["Break down the question", "Examine each component", "Synthesize insights"]
        },
        {
          name: "Creative",
          steps: ["Brainstorm possibilities", "Explore unconventional ideas", "Refine the best concepts"]
        },
        {
          name: "Practical",
          steps: ["Focus on implementation", "Consider real constraints", "Provide actionable steps"]
        },
        {
          name: "Comprehensive",
          steps: ["Research thoroughly", "Consider multiple perspectives", "Provide detailed analysis"]
        }
      ]
    };
  }
}

function generateContinuationPaths(lastPathName, lastStepsExecuted) {
  return {
    paths: [
      {
        name: "Continue Deep",
        steps: ["Build on current insights", "Explore specific implications", "Develop concrete recommendations"]
      },
      {
        name: "New Angle",
        steps: ["Approach from different perspective", "Challenge current assumptions", "Synthesize alternative view"]
      },
      {
        name: "Apply Practical",
        steps: ["Focus on implementation", "Address real-world constraints", "Create actionable plan"]
      },
      {
        name: "Expand Context",
        steps: ["Broaden the scope", "Connect to related domains", "Explore wider implications"]
      }
    ]
  };
}

// ===== App lifecycle =====
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
