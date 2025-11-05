/**
 * Chart TryChart API Service
 * Handles tax return data retrieval using Chart API
 */

export interface ChartConnectConfig {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
}

export interface ChartAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

export interface TaxReturnData {
  taxYear: number;
  filingStatus: string;
  adjustedGrossIncome: number;
  totalTax: number;
  refundAmount?: number;
  taxOwed?: number;
  // Add more fields as needed based on Chart API response
}

export interface ChartUserData {
  userId: string;
  accessToken: string;
  taxReturns: TaxReturnData[];
  lastUpdated: string;
}

export class ChartService {
  private static readonly CHART_CONNECT_BASE = 'https://connect.trychartapi.com';

  /**
   * Generate Chart Connect URL for user authorization
   */
  static generateConnectUrl(config: ChartConnectConfig): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope.join(' '),
      response_type: 'code',
      ...(config.state && { state: config.state })
    });

    return `${this.CHART_CONNECT_BASE}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<ChartAccessToken> {
    const response = await fetch('/.netlify/functions/chart-exchange-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user's tax return data
   */
  static async getTaxReturns(accessToken: string): Promise<TaxReturnData[]> {
    const response = await fetch('/.netlify/functions/chart-get-tax-returns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tax returns: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tax_returns || [];
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<ChartAccessToken> {
    const response = await fetch('/.netlify/functions/chart-refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Validate tax return data for claim eligibility
   */
  static validateTaxReturnForClaim(
    taxReturn: TaxReturnData,
    claimAmount: number
  ): { isValid: boolean; reason?: string } {
    // Basic validation logic - customize based on your requirements
    if (taxReturn.adjustedGrossIncome < 0) {
      return { isValid: false, reason: 'Invalid AGI' };
    }

    if (claimAmount > taxReturn.adjustedGrossIncome * 0.1) {
      return { 
        isValid: false, 
        reason: 'Claim amount exceeds 10% of AGI' 
      };
    }

    return { isValid: true };
  }
}
