import { useEffect, useState } from "react";
import { WebContainer } from '@webcontainer/api';

export function useWebContainer() {
    const [webcontainer, setWebcontainer] = useState<WebContainer | undefined>();
    const [error, setError] = useState<string | null>(null);

    async function bootWebContainer() {
        try {
            console.log("Booting WebContainer...");
            const webcontainerInstance = await WebContainer.boot();
            console.log("WebContainer booted successfully");
            setWebcontainer(webcontainerInstance);
            
            // Add event listeners for debugging
            webcontainerInstance.on('error', (err) => {
                console.error('WebContainer error:', err);
                setError(`WebContainer error: ${err.message || 'Unknown error'}`);
            });
            
            return webcontainerInstance;
        } catch (err) {
            console.error("Failed to boot WebContainer:", err);
            setError(err instanceof Error ? err.message : "Failed to boot WebContainer");
            return undefined;
        }
    }
    
    useEffect(() => {
        bootWebContainer();
        
        // Cleanup function
        return () => {
            if (webcontainer) {
                console.log("Cleaning up WebContainer");
                // Any cleanup needed for the WebContainer
            }
        };
    }, []);

    return webcontainer;
}