import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StepsList } from '../components/StepsList';
import { FileExplorer } from '../components/FileExplorer';
import { TabView } from '../components/TabView';
import { CodeEditor } from '../components/CodeEditor';
import { PreviewFrame } from '../components/PreviewFrame';
import { Step, FileItem, StepType } from '../types';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { parseXml } from '../steps';
import { useWebContainer } from '../hooks/useWebContainer';
import { FileNode } from '@webcontainer/api';
import { Loader } from '../components/Loader';
import { Auth } from '../components/Auth';

/**
 * Ensures that XML response is properly formatted before parsing
 * @param content The response content from the API
 * @returns Properly formatted XML string
 */
function ensureXmlFormat(content: string): string {
  if (!content) return '';
  
  // Extract content between <boltArtifact> tags if it exists
  const xmlMatch = content.match(/<boltArtifact[^>]*>[\s\S]*?<\/boltArtifact>/);
  if (xmlMatch) {
    return xmlMatch[0];
  }
  
  // If no valid XML is found, wrap the content in a basic structure
  if (!content.includes('<boltArtifact')) {
    return `<boltArtifact id="implementation-steps" title="Implementation Steps">
      ${content}
    </boltArtifact>`;
  }
  
  return content;
}

const MOCK_FILE_CONTENT = `// This is a sample file content
import React from 'react';

function Component() {
  return <div>Hello World</div>;
}

export default Component;`;

// Add DeepSeek API configuration
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "development_key";

type User = {
  username: string;
  isLoggedIn: boolean;
};

export function Builder() {
  const location = useLocation();
  const { prompt, generatedContent } = location.state as { prompt: string, generatedContent: string };
  const [userPrompt, setPrompt] = useState("");
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateSet, setTemplateSet] = useState(false);
  const webcontainer = useWebContainer();

  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  
  const [steps, setSteps] = useState<Step[]>([]);

  const [files, setFiles] = useState<FileItem[]>([]);

  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  
  // Check if user is logged in on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      } catch (err) {
        localStorage.removeItem('user');
        // Redirect to home if not logged in
        navigate('/');
      }
    } else {
      // Redirect to home if not logged in
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    let originalFiles = [...files];
    let updateHappened = false;
    steps.filter(({status}) => status === "pending").map(step => {
      updateHappened = true;
      if (step?.type === StepType.CreateFile) {
        let parsedPath = step.path?.split("/") ?? []; // ["src", "components", "App.tsx"]
        let currentFileStructure = [...originalFiles]; // {}
        let finalAnswerRef = currentFileStructure;
  
        let currentFolder = ""
        while(parsedPath.length) {
          currentFolder =  `${currentFolder}/${parsedPath[0]}`;
          let currentFolderName = parsedPath[0];
          parsedPath = parsedPath.slice(1);
  
          if (!parsedPath.length) {
            // final file
            let file = currentFileStructure.find(x => x.path === currentFolder)
            if (!file) {
              currentFileStructure.push({
                name: currentFolderName,
                type: 'file',
                path: currentFolder,
                content: step.code
              })
            } else {
              file.content = step.code;
            }
          } else {
            /// in a folder
            let folder = currentFileStructure.find(x => x.path === currentFolder)
            if (!folder) {
              // create the folder
              currentFileStructure.push({
                name: currentFolderName,
                type: 'folder',
                path: currentFolder,
                children: []
              })
            }
  
            currentFileStructure = currentFileStructure.find(x => x.path === currentFolder)!.children!;
          }
        }
        originalFiles = finalAnswerRef;
      }

    })

    if (updateHappened) {

      setFiles(originalFiles)
      setSteps(steps => steps.map((s: Step) => {
        return {
          ...s,
          status: "completed"
        }
        
      }))
    }
    console.log(files);
  }, [steps, files]);

  useEffect(() => {
    const createMountStructure = (files: FileItem[]): Record<string, any> => {
      const mountStructure: Record<string, any> = {};
  
      const processFile = (file: FileItem, isRootFolder: boolean) => {  
        if (file.type === 'folder') {
          // For folders, create a directory entry
          mountStructure[file.name] = {
            directory: file.children ? 
              Object.fromEntries(
                file.children.map(child => [child.name, processFile(child, false)])
              ) 
              : {}
          };
        } else if (file.type === 'file') {
          if (isRootFolder) {
            mountStructure[file.name] = {
              file: {
                contents: file.content || ''
              }
            };
          } else {
            // For files, create a file entry with contents
            return {
              file: {
                contents: file.content || ''
              }
            };
          }
        }
  
        return mountStructure[file.name];
      };
  
      // Process each top-level file/folder
      files.forEach(file => processFile(file, true));
  
      return mountStructure;
    };
  
    const mountFiles = async () => {
      if (!webcontainer || files.length === 0) return;
      
      try {
        console.log("Creating mount structure for files:", files);
        const mountStructure = createMountStructure(files);
        console.log("Mount structure created:", mountStructure);
        
        // Mount the files to the WebContainer
        await webcontainer.mount(mountStructure);
        console.log("Files mounted successfully");
      } catch (error) {
        console.error("Error mounting files:", error);
      }
    };
    
    mountFiles();
  }, [files, webcontainer]);

  async function init() {
    try {
      setTemplateSet(true);
      setLoading(true);
      
      console.log("Generating website from AI content for:", prompt.trim());
      console.log("Generated content:", generatedContent);
      
      // Extract HTML, CSS, JavaScript content from the generated content
      let htmlContent = '';
      let cssContent = '';
      let jsContent = '';
      
      // Use regex to extract code blocks with more robust patterns
      const htmlPattern = /```html\s*([\s\S]*?)```|<!DOCTYPE html>[\s\S]*?<\/html>/i;
      const cssPattern = /```css\s*([\s\S]*?)```|<style>\s*([\s\S]*?)<\/style>/i;
      const jsPattern = /```javascript\s*([\s\S]*?)```|```js\s*([\s\S]*?)```|<script>\s*([\s\S]*?)<\/script>/i;
      
      console.log("Extracting code from generated content...");
      console.log("Content length:", generatedContent.length);
      
      // Extract HTML with better error handling
      try {
        const htmlMatch = generatedContent.match(htmlPattern);
        if (htmlMatch) {
          if (htmlMatch[0].startsWith('```html')) {
            htmlContent = htmlMatch[1].trim();
          } else {
            // Direct HTML document match
            htmlContent = htmlMatch[0].trim();
          }
          console.log("Successfully extracted HTML content, length:", htmlContent.length);
        } else {
          console.warn("No HTML content found using primary pattern, trying alternative extraction...");
          // Alternative extraction: look for elements between <body> tags
          const bodyMatch = generatedContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Website</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="style.css">
  <script src="script.js" defer></script>
</head>
<body>
  ${bodyMatch[1].trim()}
</body>
</html>`;
            console.log("Extracted HTML from body tags, length:", htmlContent.length);
          }
        }
      } catch (error) {
        console.error("Error extracting HTML:", error);
      }
      
      // Extract CSS with better error handling
      try {
        const cssMatch = generatedContent.match(cssPattern);
        if (cssMatch) {
          if (cssMatch[1]) {
            cssContent = cssMatch[1].trim();
          } else if (cssMatch[2]) {
            cssContent = cssMatch[2].trim();
          }
          console.log("Successfully extracted CSS content, length:", cssContent.length);
        } else {
          console.warn("No CSS content found with primary pattern, looking for CSS sections...");
          // Look for CSS-like content
          const altCssMatch = generatedContent.match(/\/\*[\s\S]*?CSS[\s\S]*?\*\/([\s\S]*?)(?:```|\/\*)/i);
          if (altCssMatch) {
            cssContent = altCssMatch[1].trim();
            console.log("Extracted CSS using alternative pattern, length:", cssContent.length);
          }
        }
      } catch (error) {
        console.error("Error extracting CSS:", error);
      }
      
      // Extract JavaScript with better error handling
      try {
        const jsMatch = generatedContent.match(jsPattern);
        if (jsMatch) {
          if (jsMatch[1]) {
            jsContent = jsMatch[1].trim();
          } else if (jsMatch[2]) {
            jsContent = jsMatch[2].trim();
          } else if (jsMatch[3]) {
            jsContent = jsMatch[3].trim();
          }
          console.log("Successfully extracted JavaScript content, length:", jsContent.length);
        } else {
          console.warn("No JavaScript content found with primary pattern, looking for JS sections...");
          // Look for JS-like content
          const altJsMatch = generatedContent.match(/\/\/[\s\S]*?JavaScript[\s\S]*?([\s\S]*?)(?:```|\/\/)/i);
          if (altJsMatch) {
            jsContent = altJsMatch[1].trim();
            console.log("Extracted JavaScript using alternative pattern, length:", jsContent.length);
          }
        }
      } catch (error) {
        console.error("Error extracting JavaScript:", error);
      }
      
      // Create files from the extracted content
      let extractedFiles = [
        {
          path: "index.html",
          content: htmlContent
        },
        {
          path: "style.css",
          content: cssContent
        },
        {
          path: "script.js",
          content: jsContent
        }
      ];
      
      // Look for other file references in HTML content
      let hasAboutPage = htmlContent.includes('about.html');
      let hasProductsPage = htmlContent.includes('products.html');
      let hasContactPage = htmlContent.includes('contact.html');
      
      // Detect additional potential files based on content type
      let hasComponentStructure = prompt.toLowerCase().includes('component') || prompt.toLowerCase().includes('platform') || prompt.toLowerCase().includes('app');
      let isMultiPageSite = prompt.toLowerCase().includes('page') || prompt.toLowerCase().includes('pages') || prompt.toLowerCase().includes('site');
      
      // Add component files if needed
      if (hasComponentStructure) {
        // Add header component
        extractedFiles.push({
          path: "components/header.js",
          content: `// Header component
const header = document.querySelector('.site-header');

// Initialize header functionality
function initHeader() {
  const searchForm = header.querySelector('.search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const searchTerm = searchForm.querySelector('input').value;
      console.log('Searching for:', searchTerm);
      // Implement search functionality here
    });
  }
  
  // Mobile menu toggle
  const menuToggle = header.querySelector('.menu-toggle');
  const navMenu = header.querySelector('.nav-menu');
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      menuToggle.setAttribute('aria-expanded', 
        menuToggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'
      );
    });
  }
}

// Export for use in main script
window.initHeader = initHeader;`
        });
      }
      
      // Add standard pages if referenced
      if (hasAboutPage) {
        extractedFiles.push({
          path: "about.html",
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About - ${prompt}</title>
  <!-- Include Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="style.css">
  <script src="script.js" defer></script>
</head>
<body>
  <h1 class="text-3xl font-bold mb-4">About ${prompt}</h1>
  <p class="mb-4">This is a more detailed about page with comprehensive information.</p>
  <div class="my-8">
    <h2 class="text-2xl font-semibold mb-2">Our Mission</h2>
    <p>To provide the best user experience with innovative design and functionality.</p>
  </div>
  <div class="my-8">
    <h2 class="text-2xl font-semibold mb-2">Our Team</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 bg-gray-100 rounded">
        <div class="w-24 h-24 bg-gray-300 rounded-full mx-auto mb-4"></div>
        <h3 class="text-lg font-medium text-center">Team Member 1</h3>
        <p class="text-center text-gray-600">Position</p>
      </div>
      <div class="p-4 bg-gray-100 rounded">
        <div class="w-24 h-24 bg-gray-300 rounded-full mx-auto mb-4"></div>
        <h3 class="text-lg font-medium text-center">Team Member 2</h3>
        <p class="text-center text-gray-600">Position</p>
      </div>
      <div class="p-4 bg-gray-100 rounded">
        <div class="w-24 h-24 bg-gray-300 rounded-full mx-auto mb-4"></div>
        <h3 class="text-lg font-medium text-center">Team Member 3</h3>
        <p class="text-center text-gray-600">Position</p>
      </div>
    </div>
  </div>
  <a href="index.html" class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Back to home</a>
</body>
</html>`
        });
      }
      
      if (hasProductsPage) {
        extractedFiles.push({
          path: "products.html",
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Products - ${prompt}</title>
  <link rel="stylesheet" href="style.css">
  <script src="script.js" defer></script>
</head>
<body>
  <h1>Products - ${prompt}</h1>
  <p>This is the products page.</p>
  <a href="index.html">Back to home</a>
</body>
</html>`
        });
      }
      
      if (hasContactPage) {
        extractedFiles.push({
          path: "contact.html",
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact - ${prompt}</title>
  <link rel="stylesheet" href="style.css">
  <script src="script.js" defer></script>
</head>
<body>
  <h1>Contact - ${prompt}</h1>
  <p>This is the contact page.</p>
  <a href="index.html">Back to home</a>
</body>
</html>`
        });
      }

      // Add all files to steps
      let fileSteps = extractedFiles.map((file, index) => ({
        id: index + 1,
        title: `Create ${file.path}`,
        description: '',
        type: StepType.CreateFile,
        status: 'pending' as 'pending' | 'in-progress' | 'completed',
        code: file.content,
        path: file.path
      }));
      
      console.log("Generated file steps:", fileSteps);
      setSteps(fileSteps);
      
      // Set up the messages for chat history
      setLlmMessages([
        { role: "user", content: prompt },
        { role: "assistant", content: "I've created the initial website files based on your description." }
      ]);
      
      // Handle fullstack project structure if detected
      try {
        console.log("Checking for fullstack components in the generated content...");
        
        // Look for server file patterns
        const serverFilePatterns = [
          { pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:server\.js|index\.js|app\.js)\s*([\s\S]*?)```/i, path: "backend/server.js" },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:routes\/.*\.js)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => `backend/${match[0].match(/routes\/.*\.js/i)?.[0] || 'routes/index.js'}` 
          },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:models\/.*\.js)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => `backend/${match[0].match(/models\/.*\.js/i)?.[0] || 'models/index.js'}` 
          },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:controllers\/.*\.js)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => `backend/${match[0].match(/controllers\/.*\.js/i)?.[0] || 'controllers/index.js'}` 
          },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:middleware\/.*\.js)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => `backend/${match[0].match(/middleware\/.*\.js/i)?.[0] || 'middleware/index.js'}` 
          },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:config\/.*\.js)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => `backend/${match[0].match(/config\/.*\.js/i)?.[0] || 'config/index.js'}` 
          },
        ];
        
        // Look for frontend file patterns
        const frontendFilePatterns = [
          { pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:src\/App\.jsx?|src\/App\.tsx?)\s*([\s\S]*?)```/i, path: "frontend/src/App.js" },
          { pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:src\/index\.jsx?|src\/index\.tsx?)\s*([\s\S]*?)```/i, path: "frontend/src/index.js" },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:src\/components\/.*\.jsx?|src\/components\/.*\.tsx?)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => {
              const componentPath = match[0].match(/src\/components\/.*\.[jt]sx?/i)?.[0];
              return componentPath ? `frontend/${componentPath}` : 'frontend/src/components/index.js';
            }
          },
          { 
            pattern: /```(?:javascript|js)\s*\/\/\s*(?:filename|file):\s*(?:src\/pages\/.*\.jsx?|src\/pages\/.*\.tsx?)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => {
              const pagePath = match[0].match(/src\/pages\/.*\.[jt]sx?/i)?.[0];
              return pagePath ? `frontend/${pagePath}` : 'frontend/src/pages/index.js';
            }
          },
          { 
            pattern: /```(?:css)\s*\/\/\s*(?:filename|file):\s*(?:src\/styles\/.*\.css)\s*([\s\S]*?)```/i, 
            pathFunc: (match: RegExpMatchArray) => {
              const stylePath = match[0].match(/src\/styles\/.*\.css/i)?.[0];
              return stylePath ? `frontend/${stylePath}` : 'frontend/src/styles/main.css';
            }
          },
        ];
        
        // Extract server files
        for (const pattern of serverFilePatterns) {
          const matches = generatedContent.matchAll(new RegExp(pattern.pattern, 'g'));
          for (const match of Array.from(matches)) {
            const content = match[1].trim();
            const path = pattern.pathFunc ? pattern.pathFunc(match) : pattern.path;
            
            if (content && path) {
              console.log(`Found server file: ${path}`);
              extractedFiles.push({
                path,
                content
              });
            }
          }
        }
        
        // Extract frontend files
        for (const pattern of frontendFilePatterns) {
          const matches = generatedContent.matchAll(new RegExp(pattern.pattern, 'g'));
          for (const match of Array.from(matches)) {
            const content = match[1].trim();
            const path = pattern.pathFunc ? pattern.pathFunc(match) : pattern.path;
            
            if (content && path) {
              console.log(`Found frontend file: ${path}`);
              extractedFiles.push({
                path,
                content
              });
            }
          }
        }
        
        // Look for package.json files
        const packageJsonPattern = /```(?:json)\s*\/\/\s*(?:filename|file):\s*(?:package\.json|backend\/package\.json|frontend\/package\.json)\s*([\s\S]*?)```/gi;
        const packageMatches = generatedContent.matchAll(packageJsonPattern);
        
        for (const match of Array.from(packageMatches)) {
          const content = match[1]?.trim() || '';
          const matchStr = match[0] || '';
          const pathIndicator = matchStr.includes('backend/') ? 'backend/package.json' : 
                              matchStr.includes('frontend/') ? 'frontend/package.json' : 
                              'package.json';
          
          console.log(`Found package.json: ${pathIndicator}`);
          extractedFiles.push({
            path: pathIndicator,
            content
          });
        }

        // If we found fullstack components, create README.md with setup instructions
        if (extractedFiles.some(file => file.path.startsWith('backend/'))) {
          const readmeContent = `# Fullstack Web Application

## Project Structure
- \`frontend/\`: Contains the client-side code
- \`backend/\`: Contains the server-side code

## Setup Instructions

### Backend Setup
1. Navigate to the backend directory: \`cd backend\`
2. Install dependencies: \`npm install\`
3. Start the server: \`npm start\`

### Frontend Setup
1. Navigate to the frontend directory: \`cd frontend\`
2. Install dependencies: \`npm install\`
3. Start the development server: \`npm start\`

## API Endpoints
The backend provides the following API endpoints:
- GET /api/items - Retrieve all items
- GET /api/items/:id - Retrieve a specific item
- POST /api/items - Create a new item
- PUT /api/items/:id - Update an item
- DELETE /api/items/:id - Delete an item

## Technologies Used
- Frontend: React, Tailwind CSS
- Backend: Node.js, Express
- Database: MongoDB

## Environment Variables
Create a \`.env\` file in the backend directory with the following variables:
\`\`\`
PORT=3000
MONGODB_URI=mongodb://localhost:27017/myapp
\`\`\`
`;

          extractedFiles.push({
            path: "README.md",
            content: readmeContent
          });
        }
      } catch (error) {
        console.error("Error extracting fullstack components:", error);
      }
      
    } catch (error) {
      console.error("Error generating website:", error);
      alert("Failed to generate website plan. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Website Builder</h1>
          <p className="text-sm text-gray-400 mt-1">Prompt: {prompt}</p>
        </div>
        <Auth />
      </header>
      
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-4 gap-6 p-6">
          <div className="col-span-1 space-y-6 overflow-auto">
            <div>
              <div className="max-h-[75vh] overflow-scroll">
                <StepsList
                  steps={steps}
                  currentStep={currentStep}
                  onStepClick={setCurrentStep}
                />
              </div>
              <div>
                <div className='flex'>
                  <br />
                  {(loading || !templateSet) && <Loader />}
                  {!(loading || !templateSet) && <div className='flex'>
                    <textarea value={userPrompt} onChange={(e) => {
                    setPrompt(e.target.value)
                  }} className='p-2 w-full'></textarea>
                  <button onClick={async () => {
                    const newMessage = {
                      role: "user" as "user",
                      content: userPrompt
                    };

                    setLoading(true);
                    try {
                      // Prepare the conversation history
                      const conversationContext = llmMessages.map(msg => 
                        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
                      ).join('\n\n');
                      
                      // Enhance the user prompt
                      const enhancedUserPrompt = userPrompt;
                      
                      // Prepare the prompt
                      const promptTemplate = `
                      You are a website building assistant that provides detailed steps in XML format.
                      
                      Previous conversation: 
                      ${conversationContext}
                      
                      New user request: ${enhancedUserPrompt}
                      
                      Respond with XML steps for implementing this request for a website builder.
                      
                      Your response MUST be in this format:
                      <boltArtifact id="implementation-steps" title="Implementation Steps">
                        <boltAction type="file" filePath="path/to/file.js">
                          // Code content here
                        </boltAction>
                        <!-- More actions as needed -->
                      </boltArtifact>
                      
                      Ensure all file paths are relative and include all necessary code to implement the requested feature.
                      `;
                      
                      let stepsResponse;
                      let responseContent;
                      
                      // Check if using local model (Ollama) or DeepSeek API
                      const useLocal = false; // Set to true to use local Ollama, false to use DeepSeek
                      
                      if (useLocal) {
                        // Use local Ollama API
                        stepsResponse = await axios.post("http://localhost:11434/api/generate", {
                          model: "deepseek-coder:6.7b",
                          prompt: promptTemplate,
                          stream: false,
                          temperature: 0.7,
                          top_p: 0.95,
                          max_tokens: 8000
                        });
                        
                        console.log("Chat response API result:", stepsResponse.data);
                        responseContent = stepsResponse.data.response;
                      } else {
                        // Use DeepSeek API
                        console.log("Sending to DeepSeek API");
                        
                        // Get current HTML content from files
                        const htmlFile = files.find(file => file.path === "/index.html");
                        const htmlContent = htmlFile ? htmlFile.content || "" : "";
                        
                        const deepseekResponse = await axios.post(DEEPSEEK_API_URL, {
                          model: "deepseek-chat",
                          messages: [
                            {
                              role: "system",
                              content: "You are an expert web developer assistant who can convert user requests into specific XML steps to create websites. You break down the user's request into small concrete implementation steps." 
                            },
                            {
                              role: "user",
                              content: `Given this website description: "${prompt.trim()}", and the current HTML: "${htmlContent}", provide XML steps to implement these changes. Use format: <boltArtifact><steps><step name="..." type="create-file or shell-command"><content>... file content or command ...</content></step></steps></boltArtifact>`
                            }
                          ],
                          max_tokens: 8000,
                          temperature: 0.7,
                          top_p: 0.95
                        }, {
                          headers: {
                            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                            'Content-Type': 'application/json'
                          }
                        });
                        
                        if (!deepseekResponse.data || !deepseekResponse.data.choices || !deepseekResponse.data.choices[0].message) {
                          throw new Error("Invalid response from DeepSeek API");
                        }
                        
                        const generatedXml = deepseekResponse.data.choices[0].message.content;
                        
                        // Ensure XML is well-formed
                        const safeResponseXml = ensureXmlFormat(generatedXml);
                        console.log("Processed XML response:", safeResponseXml);
                        
                        // Parse the response XML
                        const parsedResponseSteps = parseXml(safeResponseXml);
                        console.log("Parsed response steps:", parsedResponseSteps);
                        
                        if (parsedResponseSteps.length === 0) {
                          console.error("Failed to parse response XML. Raw response:", generatedXml);
                          throw new Error("Invalid XML format received from the model");
                        }
                        
                        setLlmMessages(x => [...x, newMessage]);
                        setLlmMessages(x => [...x, {
                          role: "assistant",
                          content: generatedXml
                        }]);
                        
                        setSteps(s => [...s, ...parsedResponseSteps.map(x => ({
                          ...x,
                          status: "pending" as "pending"
                        }))]);
                        
                        // Clear the input field after sending
                        setPrompt("");
                        
                      }
                      
                    } catch (error) {
                      console.error("Error calling API:", error);
                      alert("Failed to process your request. Please ensure the API is available and try again.");
                    } finally {
                      setLoading(false);
                    }
                  }} className='bg-purple-400 px-4'>Send</button>
                  </div>}
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-1">
              <FileExplorer 
                files={files} 
                onFileSelect={setSelectedFile}
              />
            </div>
          <div className="col-span-2 bg-gray-900 rounded-lg shadow-lg p-4 h-[calc(100vh-8rem)]">
            <TabView activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="h-[calc(100%-4rem)]">
              {activeTab === 'code' ? (
                <CodeEditor file={selectedFile} />
              ) : (
                <PreviewFrame webContainer={webcontainer!} files={files} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}