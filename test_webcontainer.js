// Test script for WebContainer
console.log("Testing WebContainer functionality...");

// Import the required libraries
const { WebContainer } = require('@webcontainer/api');

async function testWebContainer() {
  try {
    console.log("Booting WebContainer...");
    const webcontainerInstance = await WebContainer.boot();
    console.log("WebContainer booted successfully!");
    
    // Create a simple file structure
    const files = {
      'index.html': {
        file: {
          contents: `
<!DOCTYPE html>
<html>
<head>
  <title>WebContainer Test</title>
</head>
<body>
  <h1>WebContainer Test</h1>
  <p>If you can see this, the WebContainer is working!</p>
</body>
</html>
          `
        }
      },
      'package.json': {
        file: {
          contents: `
{
  "name": "webcontainer-test",
  "type": "module",
  "scripts": {
    "dev": "npx serve -l 3000"
  },
  "dependencies": {
    "serve": "^14.2.1"
  }
}
          `
        }
      }
    };
    
    // Mount the files
    console.log("Mounting files...");
    await webcontainerInstance.mount(files);
    console.log("Files mounted successfully!");
    
    // Install dependencies
    console.log("Installing dependencies...");
    const installProcess = await webcontainerInstance.spawn('npm', ['install']);
    
    const installExit = await installProcess.exit;
    if (installExit !== 0) {
      throw new Error(`Installation failed with code ${installExit}`);
    }
    console.log("Dependencies installed successfully!");
    
    // Start the dev server
    console.log("Starting development server...");
    await webcontainerInstance.spawn('npm', ['run', 'dev']);
    
    // Wait for server-ready event
    webcontainerInstance.on('server-ready', (port, url) => {
      console.log(`Server started at ${url}`);
      console.log(`WebContainer test successful! You should be able to view the page at ${url}`);
      
      // In a browser environment, you could open this URL in an iframe
      console.log("\nTo view in an iframe, use this HTML:");
      console.log(`<iframe src="${url}" width="100%" height="100%"></iframe>`);
    });
    
    // Handle errors
    webcontainerInstance.on('error', (err) => {
      console.error('WebContainer error:', err);
    });
    
  } catch (error) {
    console.error("Error testing WebContainer:", error);
    console.log("\nPossible solutions:");
    console.log("1. Make sure you're running this in a browser that supports WebContainers (Chromium-based browsers)");
    console.log("2. Check that you have the @webcontainer/api package installed");
    console.log("3. Make sure you're running on HTTPS or localhost");
  }
}

// Run the test
testWebContainer(); 