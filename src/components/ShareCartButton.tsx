import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Box,
  IconButton,
  Snackbar,
  Alert,
  Chip
} from '@mui/material';
import { Share, ContentCopy, Close, AttachMoney } from '@mui/icons-material';
import { useCartStore } from '../hooks/useStore';

const ShareCartButton: React.FC = observer(() => {
  const cartStore = useCartStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showCopied, setShowCopied] = useState(false);

  const handleShare = () => {
    const url = cartStore.generateShareUrl();
    setShareUrl(url);
    setIsDialogOpen(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShowCopied(true);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  console.log('ShareCartButton render:', { hasItems: cartStore.hasItems, itemCount: cartStore.itemCount });

  if (!cartStore.hasItems) return null;

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Share />}
        onClick={handleShare}
        sx={{ borderRadius: '3px' }}
      >
        Share Cart
      </Button>

      <Dialog 
        open={isDialogOpen} 
        onClose={() => setIsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Share Your Cart</Typography>
            <IconButton onClick={() => setIsDialogOpen(false)}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Chip
              icon={<AttachMoney />}
              label={`${cartStore.itemCount} properties • $${cartStore.totalAmount.toLocaleString()}`}
              color="success"
              variant="outlined"
              sx={{ mb: 2 }}
            />
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Share this link with others to let them continue with your selected properties:
          </Typography>
          
          <TextField
            fullWidth
            value={shareUrl}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <IconButton onClick={handleCopyUrl} size="small">
                  <ContentCopy />
                </IconButton>
              )
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '3px' } }}
          />
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)} sx={{ borderRadius: '3px' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={showCopied}
        autoHideDuration={2000}
        onClose={() => setShowCopied(false)}
      >
        <Alert severity="success">Link copied to clipboard!</Alert>
      </Snackbar>
    </>
  );
});

export default ShareCartButton;
