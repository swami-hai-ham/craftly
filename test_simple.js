// Simple test script for Ollama API with clearer XML instructions
const axios = require('axios');

async function testSimple() {
  try {
    console.log('Testing Ollama API with simplified prompt...');
    
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-coder',
      prompt: `You are a code generator that outputs ONLY valid XML code.

Create a very simple but valid XML structure that follows EXACTLY this format:

<boltArtifact id="project-import" title="Website Template">
  <boltAction type="file" filePath="index.html">
    <!DOCTYPE html>
    <html>
      <head>
        <title>Example Site</title>
      </head>
      <body>
        <h1>Hello World</h1>
      </body>
    </html>
  </boltAction>
</boltArtifact>

Do not include ANY explanation, markdown formatting, or additional text. ONLY output the XML.`,
      stream: false
    });
    
    console.log('Raw API response:');
    console.log(response.data.response);
    
    // Try to extract XML if it's in a code block
    let xml = response.data.response;
    const codeBlockMatch = xml.match(/```(?:xml)?([^`]+)```/);
    if (codeBlockMatch) {
      xml = codeBlockMatch[1].trim();
      console.log('\nExtracted from code block:');
      console.log(xml);
    }
    
    if (xml.includes('<boltArtifact') && xml.includes('</boltArtifact>')) {
      console.log('\n✅ Response contains valid XML format!');
    } else {
      console.log('\n❌ Response does NOT contain the expected XML format');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSimple(); 