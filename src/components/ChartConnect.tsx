import React, { useState, useCallback } from 'react';
import {
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Chip,
} from '@mui/material';
import {
  AccountBalance,
  Security,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
} from '@mui/icons-material';
import { useChartConnect } from '@chartapi/react-connect';
import { ChartService, type TaxReturnData } from '../services/chartService';

interface ChartConnectProps {
  onTaxDataReceived: (taxReturns: TaxReturnData[]) => void;
  onError: (error: Error) => void;
  claimAmount?: number;
}

interface ChartConnectState {
  isLoading: boolean;
  isConnected: boolean;
  taxReturns: TaxReturnData[];
  error: string | null;
  accessToken: string | null;
}

const ChartConnect: React.FC<ChartConnectProps> = ({
  onTaxDataReceived,
  onError,
  claimAmount = 0,
}) => {
  const [state, setState] = useState<ChartConnectState>({
    isLoading: false,
    isConnected: false,
    taxReturns: [],
    error: null,
    accessToken: null,
  });

  // Initialize Chart Connect with embedded flow
  const { open } = useChartConnect({
    clientId: import.meta.env.VITE_CHART_CLIENT_ID ?? '',
    state: 'chart-connect',
    onSuccess: ({ code }) => {
      handleAuthorizationCode(code);
    },
    onError: ({ errorMessage }) => {
      setState(prev => ({
        ...prev,
        error: `Authorization failed: ${errorMessage}`,
        isLoading: false,
      }));
      onError(new Error(errorMessage));
    },
    onClose: () => {
      setState(prev => ({
        ...prev,
        isLoading: false,
      }));
    },
  });

  const handleAuthorizationCode = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Exchange authorization code for access token
      const tokenData = await ChartService.exchangeCodeForToken(
        code,
        `https://example.com`
      );

      // Fetch tax returns
      const taxReturns = await ChartService.getTaxReturns(tokenData.access_token);

      setState(prev => ({
        ...prev,
        isLoading: false,
        isConnected: true,
        taxReturns,
        accessToken: tokenData.access_token,
        error: null,
      }));

      onTaxDataReceived(taxReturns);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Chart';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      onError(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [onTaxDataReceived, onError]);

  const handleConnect = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    // Open the embedded Chart Connect modal
    open();
  }, [open]);

  const handleRefresh = useCallback(async () => {
    if (!state.accessToken) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const taxReturns = await ChartService.getTaxReturns(state.accessToken);
      setState(prev => ({
        ...prev,
        isLoading: false,
        taxReturns,
        error: null,
      }));
      onTaxDataReceived(taxReturns);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh tax data';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      onError(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [state.accessToken, onTaxDataReceived, onError]);

  const renderTaxReturns = () => {
    if (state.taxReturns.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No tax returns found for this account.
        </Typography>
      );
    }

    return (
      <List>
        {state.taxReturns.map((taxReturn, index) => {
          const validation = ChartService.validateTaxReturnForClaim(taxReturn, claimAmount);
          
          return (
            <ListItem key={index} divider>
              <ListItemIcon>
                {validation.isValid ? (
                  <CheckCircle color="success" />
                ) : (
                  <ErrorIcon color="error" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={`Tax Year ${taxReturn.taxYear}`}
                secondary={
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Filing Status: {taxReturn.filingStatus}
                    </Typography>
                    <Typography variant="body2">
                      AGI: ${taxReturn.adjustedGrossIncome.toLocaleString()}
                    </Typography>
                    <Typography variant="body2">
                      Total Tax: ${taxReturn.totalTax.toLocaleString()}
                    </Typography>
                    {taxReturn.refundAmount && (
                      <Typography variant="body2" color="success.main">
                        Refund: ${taxReturn.refundAmount.toLocaleString()}
                      </Typography>
                    )}
                    {taxReturn.taxOwed && (
                      <Typography variant="body2" color="error.main">
                        Tax Owed: ${taxReturn.taxOwed.toLocaleString()}
                      </Typography>
                    )}
                    {!validation.isValid && (
                      <Chip
                        label={validation.reason}
                        color="error"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                }
              />
            </ListItem>
          );
        })}
      </List>
    );
  };

  if (state.isLoading) {
    return (
      <Card sx={{ borderRadius: '3px' }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2 }}>
            {state.isConnected ? 'Refreshing tax data...' : 'Connecting to Chart...'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (state.error) {
    return (
      <Card sx={{ borderRadius: '3px' }}>
        <CardContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.error}
          </Alert>
          <Button
            onClick={handleConnect}
            variant="contained"
            startIcon={<AccountBalance />}
            sx={{ borderRadius: '3px' }}
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.isConnected) {
    return (
      <Card sx={{ borderRadius: '3px' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <CheckCircle color="success" />
            <Typography variant="h6">
              Tax Returns Connected
            </Typography>
            <Button
              onClick={handleRefresh}
              startIcon={<Refresh />}
              size="small"
              sx={{ ml: 'auto' }}
            >
              Refresh
            </Button>
          </Stack>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            We've successfully retrieved your tax return data to help validate your claim.
          </Typography>

          {renderTaxReturns()}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ borderRadius: '3px' }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <AccountBalance color="primary" />
          <Typography variant="h6">
            Connect Your Tax Returns
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          To help validate your claim, we can securely retrieve your tax return information 
          from the IRS. This helps ensure your claim is processed correctly.
        </Typography>

        <List sx={{ mb: 3 }}>
          <ListItem>
            <ListItemIcon>
              <Security color="success" />
            </ListItemIcon>
            <ListItemText
              primary="Secure & Encrypted"
              secondary="Your data is protected with bank-level security"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircle color="success" />
            </ListItemIcon>
            <ListItemText
              primary="IRS Verified"
              secondary="Direct connection to official IRS records"
            />
          </ListItem>
        </List>

        <Button
          onClick={handleConnect}
          variant="contained"
          fullWidth
          startIcon={<AccountBalance />}
          sx={{ borderRadius: '3px' }}
        >
          Connect Tax Returns
        </Button>
      </CardContent>
    </Card>
  );
};

export default ChartConnect;
