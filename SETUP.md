# StratifyAI Setup Instructions

## Quick Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Get Your Groq API Key**
   - Visit https://console.groq.com/
   - Sign up for a free account
   - Navigate to API Keys section
   - Create a new API key

3. **Create .env File**
   - Create a file named `.env` in the root directory
   - Add the following line:
     ```
     GROQ_API_KEY=your_actual_api_key_here
     ```
   - Replace `your_actual_api_key_here` with your actual Groq API key

4. **Run the Application**
   ```bash
   npm start
   ```

## Environment Variables

The application uses the following environment variable:
- `GROQ_API_KEY`: Your Groq API key (required)

## Model Configuration

You can change the model in `main.js` by editing the `model` parameter in the API calls. Available models include:
- `llama-3.1-8b-instant` (default, fast and efficient)
- `mixtral-8x7b-32768` (larger context window)
- `gemma-7b-it`
- `llama-3.3-70b-versatile` (if available)

