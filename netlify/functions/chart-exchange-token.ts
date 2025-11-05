import { Handler } from '@netlify/functions';

interface TokenExchangeRequest {
  code: string;
  redirect_uri: string;
}

interface ChartTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    if (!event.body) {
      throw new Error('Request body is missing');
    }

    const { code, redirect_uri }: TokenExchangeRequest = JSON.parse(event.body);

    if (!code || !redirect_uri) {
      throw new Error('Missing required parameters: code and redirect_uri');
    }

    // Get Chart API credentials from environment variables
    const clientId = process.env.CHART_CLIENT_ID;
    const clientSecret = process.env.CHART_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Chart API credentials not configured');
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.trychartapi.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Chart API token exchange error:', errorData);
      throw new Error(`Token exchange failed: ${errorData.error_description || tokenResponse.statusText}`);
    }

    const tokenData: ChartTokenResponse = await tokenResponse.json();

    // Store token data with timestamp
    const tokenWithTimestamp = {
      ...tokenData,
      created_at: Date.now(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(tokenWithTimestamp),
    };

  } catch (error) {
    console.error('Error exchanging Chart token:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};

export { handler };
