import { Handler } from '@netlify/functions';
import crypto from 'crypto';

interface ChartWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      user_id?: string;
      [key: string]: any;
    };
  };
  created: number;
}

const MAX_TIMESTAMP_DIFF_MS = 5 * 60 * 1000; // 5 minutes

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Chart-Signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    if (!event.body) throw new Error('Request body is missing');

    const webhookSecret = process.env.CHART_WEBHOOK_SECRET!;
    const signatureHeader =
      event.headers['chart-signature'] || event.headers['Chart-Signature'];
    if (!signatureHeader) throw new Error('Missing Chart-Signature header');

    // Parse header: t=<timestamp>,v1=<signature>
    const sigMap = Object.fromEntries(
      signatureHeader.split(',').map((p) => p.split('='))
    );
    const timestamp = sigMap.t;
    const receivedSignature = sigMap.v1;

    if (!timestamp || !receivedSignature) {
      throw new Error('Invalid signature header format');
    }

    // Prevent replay attacks
    const tsDiff = Math.abs(Date.now() - Number(timestamp));
    if (tsDiff > MAX_TIMESTAMP_DIFF_MS) {
      throw new Error('Timestamp outside of allowed window');
    }

    // Build payload to sign
    const payloadToSign = `${timestamp}.${event.body}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadToSign, 'utf8')
      .digest('hex');

    // Timing-safe compare
    const valid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    if (!valid) {
      console.error('Invalid Chart webhook signature', {
        receivedSignature,
        expectedSignature,
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    const webhookEvent: ChartWebhookEvent = JSON.parse(event.body);

    console.log(`Received Chart webhook: ${webhookEvent.type}`, webhookEvent);

    // Handle different webhook event types
    switch (webhookEvent.type) {
      // Widget Events
      case 'widget.opened':
        await handleWidgetOpened(webhookEvent);
        break;
      
      case 'widget.closed':
        await handleWidgetClosed(webhookEvent);
        break;
      
      case 'widget.failed':
        await handleWidgetFailed(webhookEvent);
        break;
      
      // Client Link Events
      case 'client_link.opened':
        await handleClientLinkOpened(webhookEvent);
        break;
      
      case 'client_link.closed':
        await handleClientLinkClosed(webhookEvent);
        break;
      
      case 'client_link.failed':
        await handleClientLinkFailed(webhookEvent);
        break;
      
      case 'client_link.succeeded':
        await handleClientLinkSucceeded(webhookEvent);
        break;
      
      // Taxpayer Events
      case 'taxpayer.status_changed':
        await handleTaxpayerStatusChanged(webhookEvent);
        break;
      
      case 'taxpayer.records_synced':
        await handleTaxpayerRecordsSynced(webhookEvent);
        break;
      
      case 'taxpayer.disconnected':
        await handleTaxpayerDisconnected(webhookEvent);
        break;
      
      default:
        console.log(`Unhandled webhook event type: ${webhookEvent.type}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };

  } catch (error) {
    console.error('Error processing Chart webhook:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};

// Widget Events
async function handleWidgetOpened(event: ChartWebhookEvent) {
  console.log('Chart widget opened:', event.data.object.id);
  // Track widget usage analytics
  // You might want to log this for user engagement metrics
}

async function handleWidgetClosed(event: ChartWebhookEvent) {
  console.log('Chart widget closed:', event.data.object.id);
  // Track widget abandonment
  // Could trigger follow-up actions or analytics
}

async function handleWidgetFailed(event: ChartWebhookEvent) {
  console.log('Chart widget failed:', event.data.object.id, event.data.object);
  // Handle widget failures
  // You might want to notify support or retry the connection
}

// Client Link Events
async function handleClientLinkOpened(event: ChartWebhookEvent) {
  console.log('Client link opened:', event.data.object.id);
  // Track when user starts the tax provider connection process
  // Useful for conversion funnel analytics
}

async function handleClientLinkClosed(event: ChartWebhookEvent) {
  console.log('Client link closed:', event.data.object.id);
  // Track when user abandons the connection process
  // Could trigger re-engagement campaigns
}

async function handleClientLinkFailed(event: ChartWebhookEvent) {
  console.log('Client link failed:', event.data.object.id, event.data.object);
  // Handle connection failures
  // You might want to notify the user or support team
}

async function handleClientLinkSucceeded(event: ChartWebhookEvent) {
  console.log('Client link succeeded:', event.data.object.id);
  // Handle successful connection to tax provider
  // This is a key success event - user successfully connected their tax data
  // You might want to trigger next steps in your flow or send confirmation
}

// Taxpayer Events
async function handleTaxpayerStatusChanged(event: ChartWebhookEvent) {
  console.log('Taxpayer status changed:', event.data.object.id, event.data.object.status);
  // Handle changes in taxpayer connection status
  // Update your database with the new status
  // This could affect what data is available or user permissions
}

async function handleTaxpayerRecordsSynced(event: ChartWebhookEvent) {
  console.log('Taxpayer records synced:', event.data.object.id);
  // Handle when tax records are successfully synced
  // This is when fresh tax data becomes available
  // You might want to fetch the latest data and update your system
  // This is a critical event for your application
}

async function handleTaxpayerDisconnected(event: ChartWebhookEvent) {
  console.log('Taxpayer disconnected:', event.data.object.id);
  // Handle when user disconnects their tax data
  // Clean up any stored tax data for this user
  // You might want to notify the user or update their account status
}

export { handler };
