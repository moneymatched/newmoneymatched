import React from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Stack,
  Link,
  Divider,
} from '@mui/material';
import {
  Email,
  Phone,
  AccessTime,
} from '@mui/icons-material';
import Header from './Header';

const ContactPage: React.FC = () => {
  return (
    <>
      <Header />
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography 
          variant="h1" 
          gutterBottom 
          sx={{ 
            fontSize: { xs: '2rem', md: '2.5rem' },
            textAlign: 'center',
            mb: 4
          }}
        >
          Contact Us
        </Typography>

        <Typography 
          variant="body1" 
          sx={{ 
            textAlign: 'center',
            mb: 6,
            color: 'text.secondary'
          }}
        >
          Have questions? We're here to help! Get in touch with our team.
        </Typography>

        <Paper 
          elevation={4} 
          sx={{ 
            p: 4, 
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Stack spacing={4}>
            {/* Email Contact */}
            <Box sx={{ textAlign: 'center' }}>
              <Email 
                sx={{ 
                  fontSize: 48, 
                  color: '#4CAF50',
                  mb: 2
                }} 
              />
              <Typography variant="h5" gutterBottom>
                Email or Text Us
              </Typography>
              <Link 
                href="mailto:hi@moneymatched.com"
                sx={{ 
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline'
                  }
                }}
              >
                hi@moneymatched.com
              </Link>
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                We typically respond within 24 hours
              </Typography>
            </Box>

            <Divider />

            {/* Phone Contact */}
            <Box sx={{ textAlign: 'center' }}>
              <Phone 
                sx={{ 
                  fontSize: 48, 
                  color: '#4CAF50',
                  mb: 2
                }} 
              />
              <Typography variant="h5" gutterBottom>
                Call Us
              </Typography>
              <Link 
                href="tel:+13169921795"
                sx={{ 
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline'
                  }
                }}
              >
                (316) 992-1795
              </Link>
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                24/7 - We're always here to help
              </Typography>
            </Box>

            <Divider />

            {/* Business Hours */}
            <Box sx={{ textAlign: 'center' }}>
              <AccessTime 
                sx={{ 
                  fontSize: 48, 
                  color: '#4CAF50',
                  mb: 2
                }} 
              />
              <Typography variant="h5" gutterBottom>
                Business Hours
              </Typography>
              <Typography variant="body1">
                <strong>24/7 Availability</strong> - We're always here to help you reclaim your unclaimed property!
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {/* Team Photo */}
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Paper 
            elevation={4} 
            sx={{ 
              p: 3, 
              borderRadius: 2,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              maxWidth: '800px',
              mx: 'auto'
            }}
          >
            <Box
              component="img"
              src="/team-dinner.jpg"
              alt="Team dinner with Fiona Ma, California State Treasurer"
              sx={{
                width: '100%',
                maxWidth: '600px',
                height: 'auto',
                borderRadius: 2,
                mb: 2,
                boxShadow: 2
              }}
            />
            <Typography 
              variant="body1" 
              sx={{ 
                fontStyle: 'italic',
                color: 'text.secondary',
                maxWidth: '500px',
                mx: 'auto'
              }}
            >
              We were honored to have dinner with Fiona Ma, California's State Treasurer to discuss unclaimed property and how we're helping reunite people with their unclaimed funds.
            </Typography>
          </Paper>
        </Box>


        {/* Footer Note */}
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            We're committed to providing excellent customer service. Don't hesitate to reach out!
          </Typography>
        </Box>
      </Container>
    </>
  );
};

export default ContactPage;
