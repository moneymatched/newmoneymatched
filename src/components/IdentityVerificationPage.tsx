import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Container, Paper, CircularProgress, Typography, Alert, Button } from '@mui/material';
import { loadStripe } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string || "pk_live_51RFM90G1gGcGMAQDV1dFkEB2DBDl0RswSmyGd6AdtpgvNcV0JhpX1Abb41PK5rvf4mBfqaWoFCX3UeAU7Yd1NsFY001rVVFfvl";

const IdentityVerificationPage: React.FC = () => {
  const navigate = useNavigate();
  const [isBooting, setIsBooting] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // 1) Create VerificationSession on mount (server returns { id, client_secret, url })
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/.netlify/functions/create-verification-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_flow: 'vf_1S9VWcG1gGcGMAQDOPBFmtWx', // your flow id
            // return_url is optional for modal; we’ll programmatically navigate after success
            return_url: `${window.location.origin}/checkout?verified=true`,
          }),
        });

        if (!res.ok) throw new Error('Failed to create verification session');

        const data = await res.json();
        setClientSecret(data.client_secret);
        setSessionId(data.id);
        setIsBooting(false);
      } catch (e: any) {
        setErr(e?.message || 'Failed to create verification session');
        setIsBooting(false);
      }
    })();
  }, []);

  // 2) Open the Identity modal using the client_secret
  const startVerification = useCallback(async () => {
    if (!clientSecret) return;
    setIsVerifying(true);
    try {
      const stripe = await loadStripe(PUBLISHABLE_KEY);
      if (!stripe) throw new Error('Stripe.js failed to load');

      // Open Stripe Identity modal
      const result = await stripe.verifyIdentity(clientSecret);

      if (result?.error) {
        // User closed the modal or there was an error
        setErr(result.error.message || 'Verification was canceled or failed.');
        setIsVerifying(false);
        // You can also choose to route back so they can retry later:
        // navigate('/checkout');
        return;
      }

      // Success: modal completed without error
      // If you want to double-check on the server, you can call your backend
      // to retrieve the session by `sessionId` and confirm status === 'verified'.
      navigate('/checkout?verified=true');
    } catch (e: any) {
      setErr(e?.message || 'Failed to start identity verification');
      setIsVerifying(false);
    }
  }, [clientSecret, navigate]);

  if (isBooting) {
    return (
      <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', bgcolor:'grey.100' }}>
        <Container maxWidth="md">
          <Paper elevation={3} sx={{ p:4, borderRadius:2, textAlign:'center' }}>
            <CircularProgress />
            <Typography variant="h6" sx={{ mt:2 }}>Preparing verification…</Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', bgcolor:'grey.100' }}>
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p:4, borderRadius:2, textAlign:'center' }}>
          <Typography variant="h5" gutterBottom>Identity Verification</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb:3 }}>
            We’ll verify your identity securely in a Stripe-hosted modal.
          </Typography>

          {err && (
            <Alert severity="error" sx={{ mb:2 }}>{err}</Alert>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={startVerification}
            disabled={!clientSecret || isVerifying}
          >
            {isVerifying ? 'Opening…' : 'Start verification'}
          </Button>

          {/* Optional: show session reference for debugging */}
          {sessionId && (
            <Typography variant="caption" display="block" sx={{ mt:2, color:'text.secondary' }}>
              Session: {sessionId}
            </Typography>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default IdentityVerificationPage;
