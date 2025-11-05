import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

interface DocuSignSDK {
  loadDocuSign: (integrationKey: string) => Promise<DocuSignInstance>;
}

interface DocuSignInstance {
  signing: (config: SigningConfig) => SigningInterface;
}

interface SigningConfig {
  url: string;
  displayFormat: 'focused' | 'embedded';
  style?: {
    branding?: {
      primaryButton?: {
        backgroundColor: string;
        color: string;
      };
    };
    signingNavigationButton?: {
      finishText: string;
      position: string;
    };
  };
}

interface SigningInterface {
  on: (event: string, callback: (data: unknown) => void) => void;
  mount: (element: HTMLElement) => Promise<void>;
  unmount?: () => void;
}

declare global {
  interface Window {
    DocuSign: DocuSignSDK;
  }
}

interface SigningComponentProps {
  signingUrl: string;
  onSessionEnd?: (event: unknown) => void;
  onError?: (error: Error | unknown) => void;
}

const SigningComponent: React.FC<SigningComponentProps> = ({
  signingUrl,
  onSessionEnd,
  onError
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const signingInstanceRef = useRef<SigningInterface | null>(null);

  useEffect(() => {
    if (!signingUrl || !containerRef.current) return;

    const initializeDocuSign = async () => {
      try {
        // Check if DocuSign SDK is loaded
        if (!window.DocuSign) {
          throw new Error('DocuSign SDK not loaded');
        }

        // Get the integration key from environment variables
        const integrationKey = "d7b01701-1cb3-42bc-b3f3-c08204bb5775";

        console.log('Loading DocuSign with integration key:', integrationKey);
        
        // Load DocuSign SDK
        const docusign = await window.DocuSign.loadDocuSign(integrationKey);
        
        // Create signing instance
        const signing = docusign.signing({
          url: signingUrl,
          displayFormat: 'focused',
          style: {
            branding: {
              primaryButton: {
                backgroundColor: '#333',
                color: '#fff',
              },
            },
            signingNavigationButton: {
              finishText: 'Done!',
              position: 'bottom-center',
            },
          },
        });

        // Store reference for cleanup
        signingInstanceRef.current = signing;

        // Handle session end event
        signing.on('sessionEnd', (event: unknown) => {
          console.log('DocuSign session ended:', event);
          if (onSessionEnd) {
            onSessionEnd(event);
          }
        });

        // Handle other events
        // signing.on('error', (error: unknown) => {
        //   console.error('DocuSign error:', error);
        //   if (onError) {
        //     onError(error);
        //   }
        // });

        // Mount the signing interface
        if (containerRef.current) {
          await signing.mount(containerRef.current);
          console.log('DocuSign mounted successfully');
        }

      } catch (error) {
        console.error('Error initializing DocuSign:', error);
        if (onError) {
          onError(error);
        }
      }
    };

    initializeDocuSign();

    // Cleanup function
    return () => {
      if (signingInstanceRef.current) {
        try {
          signingInstanceRef.current.unmount?.();
        } catch (error) {
          console.warn('Error unmounting DocuSign:', error);
        }
        signingInstanceRef.current = null;
      }
    };
  }, [signingUrl, onSessionEnd, onError]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      {!signingUrl && (
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={40} />
          <Typography variant="body2" sx={{ mt: 2 }}>
            Loading signing interface...
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SigningComponent;
