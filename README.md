# Craftly - Website Builder with DeepSeek AI

A website builder application that uses the DeepSeek AI model via Ollama to generate website templates and code.

## Setup Instructions

### Prerequisites

1. Install [Node.js](https://nodejs.org/) (v14 or later)
2. Install [Ollama](https://ollama.com/) for your operating system
3. Pull the DeepSeek model using Ollama:
   ```
   ollama pull deepseek-coder
   ```

### Running the Application

1. Make sure Ollama is running (you should see it in your system tray)
2. Start the backend server:
   ```
   cd be
   npm install
   npm run dev
   ```
   The backend server will run on port 3001 (http://localhost:3001)
   
3. In a new terminal, start the frontend server:
   ```
   cd frontend
   npm install
   npm run dev
   ```
4. Open your browser and go to http://localhost:5173

### Ollama API Information

This application uses the `/api/generate` endpoint of Ollama:
- Endpoint: `http://localhost:11434/api/generate`
- Request format:
  ```json
  {
    "model": "deepseek-coder",
    "prompt": "Your prompt here",
    "stream": false
  }
  ```
- Response format:
  ```json
  {
    "model": "deepseek-coder",
    "created_at": "timestamp",
    "response": "The generated text",
    "done": true
  }
  ```

### Troubleshooting

If you encounter any issues with the DeepSeek AI model:

1. Verify that Ollama is running by executing in a terminal:
   ```
   ollama run deepseek-coder "Hello, world!"
   ```
2. Verify that the API is accessible by running the test script:
   ```
   node test_ollama.js
   ```
3. Check your browser console for any error messages.
4. Ensure you're using the correct API endpoint (`/api/generate` instead of `/v1/chat/completions`).
5. If you see "address already in use" errors, check if another application is using port 3001 and stop it, or modify the PORT constant in be/src/index.ts.

## Features

- Website building and template generation
- Login and registration system
- Local AI inference via Ollama
- Code editing and preview 