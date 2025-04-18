import axios from 'axios';

// DeepSeek API configuration
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "development_key";

// Token limit configuration by task complexity
export const TOKEN_LIMITS = {
  SIMPLE_STATIC: 1500,      // Simple static site (HTML/CSS)
  RESPONSIVE_MULTI: 2500,   // Responsive multi-section site
  WEB_APP_API: 4000,        // Web app with API integration
  SPA_REACT: 5000,          // React or SPA generation
  LARGE_PROJECT: 7000,      // Large project + documentation
  FULLSTACK: 8192           // Maximum allowed by DeepSeek API (was 8500)
};

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekRequestOptions {
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Detect complexity level based on prompt content
 */
export function detectComplexityLevel(prompt: string): number {
  const promptLower = prompt.toLowerCase();
  
  // Check for fullstack indicators - prioritize this first
  if (
    promptLower.includes('fullstack') || 
    promptLower.includes('full stack') ||
    promptLower.includes('backend and frontend') ||
    promptLower.includes('server and client') ||
    // Combinations of technologies that suggest fullstack
    (promptLower.includes('node') && promptLower.includes('react')) ||
    (promptLower.includes('express') && promptLower.includes('mongodb')) ||
    (promptLower.includes('django') && promptLower.includes('frontend')) ||
    (promptLower.includes('flask') && promptLower.includes('frontend'))
  ) {
    return TOKEN_LIMITS.FULLSTACK;
  }
  
  // Check for complex project indicators
  if (
    promptLower.includes('documentation') || 
    promptLower.includes('large project') ||
    promptLower.includes('full stack') ||
    (promptLower.includes('react') && promptLower.length > 1000)
  ) {
    return TOKEN_LIMITS.LARGE_PROJECT;
  }
  
  // Check for SPA/React indicators
  if (
    promptLower.includes('react') || 
    promptLower.includes('vue') || 
    promptLower.includes('angular') ||
    promptLower.includes('spa') ||
    promptLower.includes('single page application')
  ) {
    return TOKEN_LIMITS.SPA_REACT;
  }
  
  // Check for web app with API indicators
  if (
    promptLower.includes('api') || 
    promptLower.includes('fetch') || 
    promptLower.includes('database') ||
    promptLower.includes('backend') ||
    promptLower.includes('authentication')
  ) {
    return TOKEN_LIMITS.WEB_APP_API;
  }
  
  // Check for responsive multi-section site indicators
  if (
    promptLower.includes('responsive') || 
    promptLower.includes('sections') || 
    promptLower.includes('multi-page') ||
    promptLower.length > 300
  ) {
    return TOKEN_LIMITS.RESPONSIVE_MULTI;
  }
  
  // Default to simple static site
  return TOKEN_LIMITS.SIMPLE_STATIC;
}

/**
 * Call the DeepSeek API with automatic retry handling
 */
export async function callDeepSeekAPI(
  messages: Message[],
  options: DeepSeekRequestOptions = {}
): Promise<string> {
  const {
    model = "deepseek-chat",
    temperature = 0.8,
    top_p = 0.95,
    max_tokens,
    timeout = 75000,
    retries = 2,
    retryDelay = 2000
  } = options;

  // If max_tokens not specified, try to detect complexity from the last user message
  const tokenLimit = max_tokens || (
    messages.length > 0 && messages[messages.length - 1].role === 'user'
      ? detectComplexityLevel(messages[messages.length - 1].content)
      : TOKEN_LIMITS.RESPONSIVE_MULTI // Default to responsive multi-section
  );

  console.log("DeepSeek API Configuration:");
  console.log("- URL:", DEEPSEEK_API_URL);
  console.log("- Model:", model);
  console.log("- Token limit:", tokenLimit);
  console.log("- API Key available:", !!DEEPSEEK_API_KEY);
  console.log("- Messages count:", messages.length);
  
  // Validate API key
  if (!DEEPSEEK_API_KEY || !DEEPSEEK_API_KEY.startsWith('sk-')) {
    throw new Error("DeepSeek API key appears to be invalid or not configured");
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < retries) {
    attempt++;
    console.log(`DeepSeek API attempt ${attempt}/${retries}`);

    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model,
          messages,
          max_tokens: tokenLimit,
          temperature,
          top_p
        },
        {
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout,
          validateStatus: (status) => status === 200
        }
      );

      if (!response.data || !response.data.choices || !response.data.choices[0].message) {
        throw new Error("Invalid response structure from DeepSeek API");
      }

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error;

      if (attempt < retries) {
        console.log(`Waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All attempts failed
  throw lastError || new Error("All API attempts failed");
}

/**
 * Generate website code using DeepSeek API
 */
export async function generateWebsiteCode(prompt: string): Promise<string> {
  const enhancedPrompt = enhancePrompt(prompt);
  
  // Check if user explicitly requested high token count
  const requestedHighTokens = prompt.toLowerCase().includes('9000') || 
                             prompt.toLowerCase().includes('9k') || 
                             prompt.toLowerCase().includes('8k');
  
  // Set complexity level - cap at 8192 for DeepSeek API
  const detectedComplexity = detectComplexityLevel(prompt);
  const complexityLevel = Math.min(
    requestedHighTokens ? 8192 : detectedComplexity, 
    8192
  );
  
  console.log(`Requested high tokens: ${requestedHighTokens}`);
  console.log(`Detected complexity level: ${detectedComplexity} tokens`);
  console.log(`Using token limit: ${complexityLevel} tokens (max allowed: 8192)`);
  
  // Use a more direct approach with token limit based on complexity
  return callDeepSeekAPI([
    {
      role: "system",
      content: "You are an expert web developer who creates beautiful, modern websites with cutting-edge designs using HTML, CSS (Tailwind), and JavaScript. Focus on visually stunning, professional layouts with modern UI/UX principles."
    },
    {
      role: "user",
      content: enhancedPrompt
    }
  ], {
    max_tokens: complexityLevel,
    temperature: 0.8,
    timeout: complexityLevel > 5000 ? 120000 : 75000, // Longer timeout for complex projects
  });
}

/**
 * Enhances the user's input prompt to generate better website code
 */
function enhancePrompt(userInput: string): string {
  if (!userInput || userInput.trim() === '') return '';

  // Force fullstack if explicitly requested
  const forceFullstack = userInput.toLowerCase().includes('fullstack') || 
                         userInput.toLowerCase().includes('full stack') ||
                         userInput.toLowerCase().includes('8k') ||
                         userInput.toLowerCase().includes('backend');

  // Detect site type for specialized instructions
  const isVideoSite = userInput.toLowerCase().includes('video') || 
                     userInput.toLowerCase().includes('stream') || 
                     userInput.toLowerCase().includes('youtube');
  
  const isEcommerce = userInput.toLowerCase().includes('shop') || 
                     userInput.toLowerCase().includes('store') || 
                     userInput.toLowerCase().includes('product') ||
                     userInput.toLowerCase().includes('ecommerce');
  
  const isPortfolio = userInput.toLowerCase().includes('portfolio') || 
                     userInput.toLowerCase().includes('showcase') || 
                     userInput.toLowerCase().includes('gallery');

  // Create a more detailed and visually focused prompt
  let basePrompt = `
Create a ${forceFullstack ? "FULLSTACK" : "COMPLEX, VISUALLY IMPRESSIVE"} website based on this description: "${userInput.trim()}"
`;

  if (forceFullstack) {
    basePrompt += `
FULLSTACK ARCHITECTURE REQUIREMENTS:
- Create BOTH backend and frontend components
- Structure the project with proper separation of concerns
- Include server-side code (Node.js/Express, Django, Flask, etc. based on context)
- Create necessary API endpoints for data operations
- Include database models and schemas
- Implement proper routing for both backend and frontend
- Add authentication flow if relevant to the application
- Structure the project files in an organized manner

BACKEND COMPONENTS TO INCLUDE:
- Server setup and configuration
- API routes and controllers
- Database models and connection
- Authentication middleware (if applicable)
- Error handling and validation
- Environment configuration

FRONTEND COMPONENTS TO INCLUDE:
- Complete responsive interface with modern design
- API integration with the backend
- State management for data
- Form handling with validation
- User authentication UI (if applicable)
`;
  }

  basePrompt += `
VISUAL & DESIGN REQUIREMENTS:
- Create a modern, professional, visually striking design
- Use modern UI trends (glassmorphism, neumorphism, gradient accents, etc.)
- Implement elegant animations and transitions
- Use creative layouts with overlapping elements
- Include visually interesting section dividers
- Use modern typography combinations
- Implement visual hierarchy with focal points
- Create depth with shadows and layering

TECHNICAL REQUIREMENTS:
- Use Tailwind CSS for styling with custom configurations where needed
- Add subtle, elegant animations and hover effects
- Write clean, semantic HTML structure
- Use advanced Tailwind features (custom classes, responsive design patterns)
- Implement responsive design that works on mobile, tablet and desktop
- Include all necessary JavaScript for interactive elements
- Write modern ES6+ JavaScript with clean organization

FORMATTING CONSTRAINTS:
- Response must include complete code blocks for all components
- Structure the response with clear file paths and organization
- Include proper imports and dependencies
`;

  // Add specialized instructions based on site type
  if (isVideoSite) {
    basePrompt += `
VIDEO PLATFORM SPECIFIC REQUIREMENTS:
- Create a professional video player UI with custom controls
- Implement an elegant grid of video thumbnails with hover effects
- Include a modern search bar with autocomplete styling
- Design a sidebar with animated category navigation
- Add trending section with visual indicators
- Create user profile/channel cards with modern design
- Add comments section with threaded replies styling
`;
  }

  if (isEcommerce) {
    basePrompt += `
E-COMMERCE SPECIFIC REQUIREMENTS:
- Design a visually appealing product showcase grid
- Create elegant product cards with hover effects
- Implement a modern product gallery with thumbnails
- Design a slick shopping cart UI
- Add visually appealing CTA buttons
- Include pricing tables with modern styling
- Create filter/sort controls with elegant dropdowns
`;
  }

  if (isPortfolio) {
    basePrompt += `
PORTFOLIO SPECIFIC REQUIREMENTS:
- Create a striking hero section with visual impact
- Design an elegant work/project showcase grid
- Implement smooth scrolling with section transitions
- Add creative about/bio section layout
- Create visually impressive skill visualization
- Include testimonial/review cards with modern styling
- Design contact form with elegant validation styling
`;
  }

  return basePrompt;
} 