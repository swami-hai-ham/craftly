import { WebContainer } from '@webcontainer/api';
import React, { useEffect, useState } from 'react';
import { FileItem } from '../types';

interface PreviewFrameProps {
  files: FileItem[];
  webContainer: WebContainer;
}

export function PreviewFrame({ files, webContainer }: PreviewFrameProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!webContainer) {
      setError("WebContainer not initialized");
      setLoading(false);
      return;
    }

    async function setupPreview() {
      try {
        setLoading(true);
        setError("");

        // Create a basic package.json if one doesn't exist
        const packageJson = {
          name: "web-preview",
          type: "module",
          scripts: {
            dev: "npx serve -l 3000"
          },
          dependencies: {
            serve: "^14.2.1"
          }
        };

        await webContainer.fs.writeFile('package.json', JSON.stringify(packageJson, null, 2));
        
        console.log("Installing dependencies...");
        const installProcess = await webContainer.spawn('npm', ['install']);
        
        // Wait for the installation to complete
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error(`Installation failed with code ${installExitCode}`);
        }
        
        console.log("Starting server...");
        await webContainer.spawn('npm', ['run', 'dev']);
        
        // Wait for server-ready event
        webContainer.on('server-ready', (port, serverUrl) => {
          console.log(`Server started at ${serverUrl}`);
          setUrl(serverUrl);
          setLoading(false);
        });
      } catch (err) {
        console.error("Preview error:", err);
        setError(err instanceof Error ? err.message : "Failed to set up preview");
        setLoading(false);
      }
    }

    setupPreview();
  }, [webContainer]);

  return (
    <div className="h-full flex items-center justify-center">
      {loading && (
        <div className="text-center">
          <p className="mb-2 text-gray-400">Loading preview...</p>
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      )}
      
      {error && (
        <div className="text-center text-red-500">
          <p>Error loading preview:</p>
          <p>{error}</p>
          <p className="mt-4 text-sm text-gray-400">
            Make sure Ollama is running and all required dependencies are installed.
          </p>
        </div>
      )}
      
      {url && !loading && !error && (
        <iframe 
          src={url} 
          className="w-full h-full border-none" 
          title="Website Preview"
          sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
        />
      )}
    </div>
  );
}