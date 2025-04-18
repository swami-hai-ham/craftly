require("dotenv").config();
import express from "express";
import axios from "axios";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import { basePrompt as nodeBasePrompt } from "./defaults/node";
import { basePrompt as reactBasePrompt } from "./defaults/react";
import cors from "cors";
import { loginUser, registerUser } from "./auth";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Authentication routes
app.post("/auth/login", loginUser);
app.post("/auth/register", registerUser);

app.post("/template", async (req, res) => {
  const prompt = req.body.prompt;

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: "deepseek-coder",
      prompt: "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra: " + prompt,
      stream: false
    });

    const answer = response.data.response.toLowerCase().trim();
    if (answer === "react") {
      res.json({
        prompts: [
          BASE_PROMPT,
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [reactBasePrompt],
      });
      return;
    }

    if (answer === "node") {
      res.json({
        prompts: [
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [nodeBasePrompt],
      });
      return;
    }

    res.status(403).json({ message: "You can't access this" });
  } catch (err) {
    console.error("Model generation failed:", err);
    res.status(500).json({ error: "Local model failed to generate." });
  }
});

app.post("/chat", async (req, res) => {
  const messages = req.body.messages;
  
  try {
    // Create a combined prompt from the messages
    const combinedPrompt = messages.map((msg: { role: string; content: string }) => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n\n');
    
    const systemPrompt = getSystemPrompt();
    const fullPrompt = `${systemPrompt}\n\nPrevious conversation:\n${combinedPrompt}\n\nAssistant:`;
    
    const response = await axios.post(OLLAMA_URL, {
      model: "deepseek-coder",
      prompt: fullPrompt,
      stream: false
    });

    res.json({
      response: response.data.response,
    });
  } catch (err) {
    console.error("Model generation failed:", err);
    res.status(500).json({ error: "Local model failed to generate." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});