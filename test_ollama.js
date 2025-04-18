// Test script for Ollama API
const axios = require('axios');

async function testOllama() {
  try {
    console.log('Testing Ollama API...');
    
    // Test the API connection using /api/generate endpoint with XML prompt
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-coder',
      prompt: `
      Generate an XML template for a simple website using this format:
      
      <boltArtifact id="project-import" title="Website Template">
        <boltAction type="file" filePath="index.html">
          <!-- HTML content here -->
        </boltAction>
        <boltAction type="file" filePath="style.css">
          /* CSS content here */
        </boltAction>
      </boltArtifact>
      
      Make sure to include actual HTML and CSS code in the response.
      `,
      stream: false
    });
    
    console.log('Success! API response:');
    const responseData = response.data.response;
    
    // Check if the response contains the expected XML format
    if (responseData.includes('<boltArtifact') && responseData.includes('</boltArtifact>')) {
      console.log('✅ Response contains valid XML format!');
      
      // Show a shorter version of the response
      console.log('\nResponse preview:');
      console.log(responseData.substring(0, 500) + '...\n');
    } else {
      console.log('❌ Response does NOT contain the expected XML format');
      console.log('\nRaw response:');
      console.log(responseData);
    }
    
    console.log('\nYou can now use the Ollama API in your application.');
  } catch (error) {
    console.error('Error connecting to Ollama API:');
    console.error(error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    console.log('\nPlease check that:');
    console.log('1. Ollama is running (you should see it in your system tray)');
    console.log('2. The deepseek-coder model is installed (run "ollama list" to check)');
    console.log('3. No firewall is blocking connections to localhost:11434');
  }
}

testOllama(); 