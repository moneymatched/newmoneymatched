import type { Handler, HandlerEvent } from "@netlify/functions";

interface RequestData {
  verification_flow?: string;
  type?: string;
  options?: {
    document?: {
      require_matching_selfie?: boolean;
      allow_document_types?: string[];
    };
  };
  client_reference_id?: string;
  metadata?: Record<string, string>;
  return_url?: string;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 
        'Allow': 'POST',
        'Content-Type': 'application/json'
      }
    };
  }

  const headers = {
    "Content-Type": "application/json",
  };

  try {
    if (!event.body) {
      throw new Error("Request body is missing.");
    }

    const { 
      verification_flow, 
      type = 'document', 
      options = { document: { require_matching_selfie: true } },
      client_reference_id, 
      metadata,
      return_url 
    }: RequestData = JSON.parse(event.body);

    // Get Stripe secret key from environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("Stripe secret key is not set in environment variables.");
    }

    console.log(`[Stripe] Creating verification session`);

    // Prepare the request body
    const requestBody = new URLSearchParams();
    
    if (verification_flow) {
      requestBody.append('verification_flow', verification_flow);
    } else {
      // If no verification flow, create with type and options
      requestBody.append('type', type);
      if (options.document?.require_matching_selfie) {
        requestBody.append('options[document][require_matching_selfie]', 'true');
      }
    }
    
    if (client_reference_id) {
      requestBody.append('client_reference_id', client_reference_id);
    }
    
    if (metadata) {
      requestBody.append('metadata', JSON.stringify(metadata));
    }
    
    if (return_url) {
      requestBody.append('return_url', return_url);
    }

    // Create verification session using Stripe API
    const stripeResponse = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody.toString(),
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.json();
      console.error('Stripe API error:', errorData);
      throw new Error(`Stripe API error: ${errorData.error?.message || stripeResponse.statusText}`);
    }

    const verificationSession = await stripeResponse.json();
    console.log('[Stripe] Verification session created successfully:', verificationSession.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        client_secret: verificationSession.client_secret,
        id: verificationSession.id,
        url: verificationSession.url
      }),
      headers,
    };

  } catch (error) {
    console.error("Error creating verification session:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
        details: error
      })
    };
  }
};

export { handler };
