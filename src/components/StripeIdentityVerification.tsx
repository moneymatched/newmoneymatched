import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

interface StripeIdentityVerificationProps {
  verificationSessionId: string;
  onError: (error: Error) => void;
}

const StripeIdentityVerification: React.FC<StripeIdentityVerificationProps> = ({
  verificationSessionId,
  onError
}) => {
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // For Stripe Identity verification, we redirect to the verification URL
    // The verificationSessionId from our backend is the client_secret
    // We need to redirect to Stripe's hosted verification page
    
    try {
      // Construct the verification URL using the client_secret
      const verificationUrl = `https://verify.stripe.com/start/${verificationSessionId}`;
      
      // Redirect to Stripe's hosted verification page
      // The return URL is configured in the verification session
      window.location.href = verificationUrl;
      
    } catch (err) {
      console.error('Error starting verification:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start verification';
      setError(errorMessage);
      setLoading(false);
      onError(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [verificationSessionId, onError]);

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', mb: 3 }}>
        Identity Verification
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
        Redirecting to secure identity verification...
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    </Box>
  );
};

export default StripeIdentityVerification;
