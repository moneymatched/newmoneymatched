import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Card,
  CardContent,
  Stack
} from '@mui/material';
import { ShoppingCart, CheckCircle, Error } from '@mui/icons-material';
import { useCartStore } from '../hooks/useStore';

const SharedCartLoader: React.FC = observer(() => {
  const { encodedData } = useParams<{ encodedData: string }>();
  const cartStore = useCartStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadSharedCart = useCallback(async () => {
    try {
      const success = await cartStore.loadFromShareUrl(encodedData!);
      if (success) {
        setSuccess(true);
        // Don't auto-redirect - let user choose when to navigate
      } else {
        setError('This shared cart link is invalid or the properties are no longer available.');
      }
    } catch (err) {
      console.error('Failed to load shared cart:', err);
      setError('Failed to load shared cart. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [encodedData, cartStore]);

  useEffect(() => {
    if (encodedData) {
      loadSharedCart();
    }
  }, [encodedData, loadSharedCart]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography>Loading shared cart...</Typography>
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Card sx={{ maxWidth: 500, borderRadius: '3px' }}>
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <Error color="error" sx={{ fontSize: 48 }} />
              <Alert severity="error" sx={{ width: '100%' }}>
                {error}
              </Alert>
              <Button
                variant="contained"
                onClick={() => navigate('/')}
                sx={{ borderRadius: '3px' }}
              >
                Go to Home
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (success) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Card sx={{ maxWidth: 500, borderRadius: '3px' }}>
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <CheckCircle color="success" sx={{ fontSize: 48 }} />
              <Typography variant="h6">Cart Loaded Successfully!</Typography>
              <Typography variant="body2" color="text.secondary">
                {cartStore.itemCount} properties have been added to your cart.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<ShoppingCart />}
                  onClick={() => {
                    cartStore.openCheckout();
                    navigate('/checkout');
                  }}
                  sx={{ borderRadius: '3px' }}
                >
                  View Cart
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/')}
                  sx={{ borderRadius: '3px' }}
                >
                  Continue Shopping
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return null;
});

export default SharedCartLoader;
