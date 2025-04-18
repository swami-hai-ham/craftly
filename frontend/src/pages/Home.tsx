import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
import axios from "axios";
import { BACKEND_URL } from '../config';
import { Auth } from '../components/Auth';
import { generateWebsiteCode, TOKEN_LIMITS, detectComplexityLevel } from '../api/deepseek';

type User = {
  username: string;
  isLoggedIn: boolean;
};

// DeepSeek API configuration
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "development_key";

// Debug
console.log("Environment:", import.meta.env.MODE);
console.log("API Key available:", !!import.meta.env.VITE_DEEPSEEK_API_KEY);

/**
 * Determine token limit based on prompt contents if not imported from deepseek.ts
 */
function determineTokenLimit(prompt: string): number {
  const promptLower = prompt.toLowerCase();
  
  // Check for explicitly requested high token count
  if (promptLower.includes('9000') || promptLower.includes('9k') || promptLower.includes('8k')) {
    return 9000; // Higher limit for Ollama since it's not restricted like DeepSeek API
  }
  
  // Large project with documentation
  if (promptLower.includes('documentation') || 
      promptLower.includes('large project') ||
      promptLower.includes('full stack')) {
    return 7500;
  }
  
  // Fullstack project
  if (promptLower.includes('fullstack') || 
      promptLower.includes('full stack') ||
      promptLower.includes('backend and frontend')) {
    return 8500;
  }
  
  // React or SPA generation
  if (promptLower.includes('react') || 
      promptLower.includes('vue') || 
      promptLower.includes('angular') ||
      promptLower.includes('spa')) {
    return 5000;
  }
  
  // Web app with API integration
  if (promptLower.includes('api') || 
      promptLower.includes('fetch') || 
      promptLower.includes('database')) {
    return 4000;
  }
  
  // Responsive multi-section site
  if (promptLower.includes('responsive') || 
      promptLower.includes('sections') || 
      promptLower.length > 300) {
    return 2500;
  }
  
  // Simple static site (default)
  return 1500;
}

/**
 * Enhance prompt for local Ollama to match DeepSeek API quality
 */
function enhancePrompt(userInput: string): string {
  if (!userInput || userInput.trim() === '') return '';
  
  // Detect if fullstack is explicitly requested
  const isFullstack = userInput.toLowerCase().includes('fullstack') || 
                     userInput.toLowerCase().includes('full stack') ||
                     userInput.toLowerCase().includes('8k') ||
                     userInput.toLowerCase().includes('backend');
  
  // Create appropriate prompt based on request type
  if (isFullstack) {
    return `
Create a FULLSTACK web application based on this description: "${userInput.trim()}"

IMPORTANT REQUIREMENTS:
1. Create BOTH backend and frontend code
2. Structure as a complete project with all necessary files
3. Include detailed server-side implementation
4. Create database models and connection logic
5. Implement complete API endpoints
6. Build a modern, responsive frontend

PROJECT STRUCTURE:
- backend/ - Server-side code
  - server.js - Main entry point
  - routes/ - API endpoint definitions
  - controllers/ - Business logic
  - models/ - Data models
  - middleware/ - Auth, validation, etc.
  - config/ - Configuration files
- frontend/ - Client-side code
  - public/ - Static assets
  - src/ - Source code
    - components/ - UI components
    - pages/ - Page definitions
    - styles/ - CSS/styling
    - utils/ - Helper functions
    - App.js - Main component
    - index.js - Entry point

FRONTEND REQUIREMENTS:
- Modern, responsive design using Tailwind
- Clean component structure
- API integration with the backend
- Form validation and error handling
- User-friendly interface

BACKEND REQUIREMENTS:
- RESTful API endpoints
- Proper error handling
- Data validation
- Authentication logic (if applicable)
- Database connection and CRUD operations

Include complete code with proper imports and full implementation.
`;
  } else {
    // Original prompt for frontend-only sites
    return `
Create a professional website based on this description: "${userInput.trim()}"

REQUIREMENTS:
1. Write clean, modern HTML with Tailwind CSS
2. Create a visually striking design with modern UI elements
3. Make it fully responsive for all devices
4. Include interactive elements with JavaScript
5. Follow current web design trends and best practices

Your response should include:

\`\`\`html
<!DOCTYPE html>
<html>
<!-- Complete HTML with Tailwind classes -->
</html>
\`\`\`

\`\`\`css
/* Additional CSS beyond Tailwind */
\`\`\`

\`\`\`javascript
// JavaScript for interactive elements
\`\`\`

Focus on creating a professional, modern design with attention to visual details.
`;
  }
}

export function Home() {
  const [prompt, setPrompt] = useState('');
  const [useLocal, setUseLocal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [apiFailCount, setApiFailCount] = useState(0);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Debug API configuration
  useEffect(() => {
    console.log("=== DeepSeek API Configuration ===");
    console.log("API URL:", DEEPSEEK_API_URL);
    console.log("API Key available:", !!DEEPSEEK_API_KEY);
    console.log("API Key format valid:", DEEPSEEK_API_KEY?.startsWith('sk-'));
    console.log("Environment mode:", import.meta.env.MODE);
    console.log("================================");
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    // Clear any cached website data when component mounts
    localStorage.removeItem('generatedWebsite');
    localStorage.removeItem('lastPrompt');
    
    // Keep user login data
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is logged in
    if (!user?.isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }
    
    if (prompt.trim()) {
      try {
        setLoading(true);
        
        // Set a UI timeout to prevent being stuck in "Generating..." state
        loadingTimeoutRef.current = setTimeout(() => {
          console.warn("Generation request timed out after 90 seconds");
          setLoading(false);
          alert("Request is taking too long. The API might be processing your request in the background, but we've stopped waiting.\n\nYou can try again with a simpler prompt or switch to Local Ollama.");
          
          // Auto-increment the fail counter
          setApiFailCount(prev => prev + 1);
        }, 90000); // 90 second UI timeout
        
        console.log("Generating website with prompt:", prompt.trim());
        
        // If DeepSeek API has failed 3 or more times, force use of local Ollama
        const shouldUseLocal = useLocal || apiFailCount >= 3;
        
        if (shouldUseLocal) {
          // Local Ollama approach
          try {
            // Test Ollama connection before proceeding
            console.log("Testing Ollama connection...");
            const testResponse = await axios.get('http://localhost:11434/api/tags');
            console.log("Ollama connection test successful:", testResponse.data);
            
            // Check if the required model exists
            const models = testResponse.data.models || [];
            const hasModel = models.some((model: any) => 
              model.name === "deepseek-coder:6.7b" || 
              model.name === "deepseek-coder" ||
              model.name.includes("deepseek")
            );
            
            if (!hasModel) {
              console.warn("deepseek-coder model not found in available models:", models);
              alert("The deepseek-coder:6.7b model is not available in Ollama. Please run: 'ollama pull deepseek-coder:6.7b' in your terminal.");
              setLoading(false);
              return;
            }
            
            // Enhance the prompt locally
            const enhancedPrompt = enhancePrompt(prompt.trim());
            console.log("Enhanced prompt for Ollama:", enhancedPrompt.substring(0, 200) + "...");
            
            // Detect complexity level for token limit
            const complexityLevel = detectComplexityLevel ? 
              detectComplexityLevel(prompt.trim()) : 
              determineTokenLimit(prompt.trim());
              
            console.log("Detected complexity level for Ollama:", complexityLevel, "tokens");
            
            // Use local Ollama API with enhanced prompt
            const ollamaResponse = await axios.post("http://localhost:11434/api/generate", {
              model: "deepseek-coder:6.7b",
              prompt: enhancedPrompt,
              stream: false,
              temperature: 0.7,
              top_p: 0.85,
              max_tokens: complexityLevel,
              repeat_penalty: 1.1
            });
            
            // Extract from Ollama response
            if (!ollamaResponse.data || !ollamaResponse.data.response) {
              throw new Error("Invalid response format from Ollama API");
            }
            
            const generatedContent = ollamaResponse.data.response;
            console.log("Successfully received response from Ollama");
            
            // Continue with navigation passing the generated content and prompt
            navigate('/builder', { 
              state: { 
                prompt: prompt.trim(),
                generatedContent 
              } 
            });
            
          } catch (error: any) {
            console.error("Error with Ollama:", error);
            let errorDetail = "";
            if (error.response) {
              errorDetail = `\nStatus: ${error.response.status}\nMessage: ${JSON.stringify(error.response.data)}`;
            } else if (error.request) {
              errorDetail = "\nNo response received from server. Check if Ollama is running.";
            } else {
              errorDetail = `\nError: ${error.message}`;
            }
            alert(`Failed to generate content with Ollama.${errorDetail}\n\nTry these steps:\n1. Open a terminal\n2. Run: ollama serve\n3. In another terminal, run: ollama pull deepseek-coder:6.7b\n4. Try again`);
          }
        } else {
          // DeepSeek API approach using our new wrapper
          try {
            console.log("Using DeepSeek API with improved error handling");
            
            // Use our new wrapper function
            const generatedContent = await generateWebsiteCode(prompt.trim());
            console.log("Successfully received response from DeepSeek API");
            
            // Continue with navigation passing the generated content and prompt
            navigate('/builder', { 
              state: { 
                prompt: prompt.trim(),
                generatedContent 
              } 
            });
          } catch (error: any) {
            console.error("Error with DeepSeek API:", error);
            let errorDetail = "Unknown error occurred";
            
            if (error.response) {
              console.error("Response error data:", error.response.data);
              console.error("Response error status:", error.response.status);
              
              errorDetail = `Status: ${error.response.status}\nMessage: ${JSON.stringify(error.response.data)}`;
              
              if (error.response.status === 401) {
                errorDetail = "Authentication failed. The API key appears to be invalid or expired.";
              } else if (error.response.status === 429) {
                errorDetail = "Rate limit exceeded. Please try again later.";
              }
            } else if (error.request) {
              console.error("No response received:", error.request);
              errorDetail = "No response received from server. The API might be down or there's a network issue.";
            } else {
              console.error("Request setup error:", error.message);
              errorDetail = `Error: ${error.message}`;
            }
            
            alert(`Failed to connect to DeepSeek API.\n\n${errorDetail}\n\nYou might want to try the Local Ollama option instead.`);
            
            // Increment API fail counter
            setApiFailCount(prev => {
              const newCount = prev + 1;
              if (newCount >= 3 && !useLocal) {
                // Auto-switch to local after 3 failures
                setUseLocal(true);
                alert("Automatically switching to Local Ollama after multiple DeepSeek API failures.");
              }
              return newCount;
            });
          }
        }
      } finally {
        // Clear the UI timeout if the request completes
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setLoading(false);
      }
    }
  };

  // Add a function to check if Ollama is available
  const checkOllamaAvailability = async (): Promise<boolean> => {
    try {
      const response = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
      return !!response.data && Array.isArray(response.data.models);
    } catch (error) {
      console.error("Ollama is not available:", error);
      return false;
    }
  };

  // Check Ollama availability on component mount
  useEffect(() => {
    const checkOllama = async () => {
      const isOllamaAvailable = await checkOllamaAvailability();
      console.log("Ollama availability:", isOllamaAvailable);
      
      // If DeepSeek is failing and Ollama is available, show a hint
      if (apiFailCount > 0 && isOllamaAvailable && !useLocal) {
        console.log("Suggesting Ollama as an alternative");
      }
    };
    
    checkOllama();
  }, [apiFailCount, useLocal]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
      <header className="p-4 flex justify-end">
        <Auth />
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Wand2 className="w-12 h-12 text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold text-gray-100 mb-4">
              Website Builder AI
            </h1>
            <p className="text-lg text-gray-300">
              Describe your dream website, and we'll help you build it step by step
            </p>
          </div>

          {showLoginPrompt && !user?.isLoggedIn && (
            <div className="bg-amber-800 text-amber-100 p-4 rounded-lg mb-4 text-center">
              <p>Please log in to generate a website</p>
              <button 
                onClick={() => setShowLoginPrompt(false)}
                className="text-sm underline mt-2 cursor-pointer"
                style={{ pointerEvents: 'auto' }}
              >
                Dismiss
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" style={{ pointerEvents: 'auto' }}>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={user?.isLoggedIn ? "Describe the website you want to build..." : "Log in to start creating your dream website"}
                className="w-full h-32 p-4 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-gray-500"
                disabled={!user?.isLoggedIn}
                style={{ pointerEvents: user?.isLoggedIn ? 'auto' : 'none' }}
              />
              
              <div className="flex flex-col mt-4 mb-4">
                <div className="flex items-center justify-between bg-gray-800 rounded-lg p-2 mb-1">
                  <span className={`text-sm ${!useLocal ? 'text-gray-400' : 'text-blue-400 font-medium'}`}>
                    Local Ollama
                  </span>
                  
                  <div 
                    className="relative inline-block w-14 h-7 transition-all duration-300 cursor-pointer"
                    onClick={() => user?.isLoggedIn && setUseLocal(!useLocal)}
                    style={{ pointerEvents: user?.isLoggedIn ? 'auto' : 'none' }}
                  >
                    <div 
                      className={`w-14 h-7 rounded-full transition-all duration-300 ${user?.isLoggedIn ? 'bg-gray-600' : 'bg-gray-700'}`}
                    ></div>
                    <div 
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-all duration-300 ${useLocal ? 'translate-x-0 bg-blue-400' : 'translate-x-7 bg-purple-400'}`}
                    ></div>
                  </div>
                  
                  <span className={`text-sm ${useLocal ? 'text-gray-400' : 'text-purple-400 font-medium'}`}>
                    DeepSeek API
                  </span>
                </div>
                <div className="text-xs text-center text-gray-500">
                  {useLocal ? 'Using local Ollama model for generation' : 'Using DeepSeek API for generation'}
                </div>
              </div>
              
              <button
                type="submit"
                disabled={loading || !user?.isLoggedIn}
                className={`w-full mt-4 ${loading ? 'bg-blue-800' : !user?.isLoggedIn ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'} text-gray-100 py-3 px-6 rounded-lg font-medium transition-colors flex justify-center items-center`}
                style={{ pointerEvents: (loading || !user?.isLoggedIn) ? 'none' : 'auto' }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                    
                    {/* Add a Cancel button if generation takes too long */}
                    {loading && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          // Clear the UI timeout
                          if (loadingTimeoutRef.current) {
                            clearTimeout(loadingTimeoutRef.current);
                            loadingTimeoutRef.current = null;
                          }
                          
                          // Switch to local Ollama and stop loading
                          setUseLocal(true);
                          setLoading(false);
                          
                          alert("Generation canceled. Switched to Local Ollama for faster processing.");
                        }}
                        className="ml-4 bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                        style={{ pointerEvents: 'auto' }}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                ) : (
                  user?.isLoggedIn ? 'Generate Website Plan' : 'Log in to Generate'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}