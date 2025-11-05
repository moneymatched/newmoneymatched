import { Handler } from '@netlify/functions';

interface TaxReturnRequest {
  access_token: string;
  tax_years?: number[];
}

interface ChartTaxReturn {
  tax_year: number;
  filing_status: string;
  adjusted_gross_income: number;
  total_tax: number;
  refund_amount?: number;
  tax_owed?: number;
  filing_date: string;
  // Add more fields as needed based on Chart API response
}

interface ChartTaxReturnsResponse {
  tax_returns: ChartTaxReturn[];
  total_count: number;
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

    const { access_token, tax_years }: TaxReturnRequest = JSON.parse(event.body);

    if (!access_token) {
      throw new Error('Missing required parameter: access_token');
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (tax_years && tax_years.length > 0) {
      params.append('tax_years', tax_years.join(','));
    }

    // Fetch tax returns from Chart API
    const taxReturnsResponse = await fetch(
      `https://api.trychartapi.com/v1/tax-returns?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!taxReturnsResponse.ok) {
      const errorData = await taxReturnsResponse.json();
      console.error('Chart API tax returns error:', errorData);
      
      if (taxReturnsResponse.status === 401) {
        throw new Error('Invalid or expired access token');
      }
      
      throw new Error(`Failed to fetch tax returns: ${errorData.error_description || taxReturnsResponse.statusText}`);
    }

    const taxReturnsData: ChartTaxReturnsResponse = await taxReturnsResponse.json();

    // Transform the data to match our interface
    const transformedTaxReturns = taxReturnsData.tax_returns.map((returnData: ChartTaxReturn) => ({
      taxYear: returnData.tax_year,
      filingStatus: returnData.filing_status,
      adjustedGrossIncome: returnData.adjusted_gross_income,
      totalTax: returnData.total_tax,
      refundAmount: returnData.refund_amount,
      taxOwed: returnData.tax_owed,
      filingDate: returnData.filing_date,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        tax_returns: transformedTaxReturns,
        total_count: taxReturnsData.total_count,
      }),
    };

  } catch (error) {
    console.error('Error fetching tax returns:', error);
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
