// API base URL for Netlify Functions
const API_BASE_URL = '/.netlify/functions/property-search';

// Database types based on our schema
export interface DatabaseProperty {
  id: string;
  property_type: string;
  cash_reported: string;
  shares_reported: string;
  name_of_securities_reported?: string;
  number_of_owners: string;
  owner_name: string;
  owner_street_1?: string;
  owner_street_2?: string;
  owner_street_3?: string;
  owner_city?: string;
  owner_state?: string;
  owner_zip?: string;
  owner_country_code?: string;
  current_cash_balance: string;
  number_of_pending_claims: string;
  number_of_paid_claims: string;
  holder_name: string;
  holder_street_1?: string;
  holder_street_2?: string;
  holder_street_3?: string;
  holder_city?: string;
  holder_state?: string;
  holder_zip?: string;
  cusip?: string;
  created_at: string;
  updated_at: string;
}

export interface SearchPropertyResult extends DatabaseProperty {
  owner_full_address: string;
  holder_full_address: string;
  similarity_score?: number;
}

// Property search service
export class PropertySearchService {
  static async searchProperties({
    searchName,
    minAmount,
    maxAmount,
    searchCity,
    searchPropertyType,
    limit = 500
  }: {
    searchName: string;
    minAmount?: number;
    maxAmount?: number;
    searchCity?: string;
    searchPropertyType?: string;
    limit?: number;
  }): Promise<SearchPropertyResult[]> {
    try {
      const params = new URLSearchParams({
        searchName,
        limit: limit.toString(),
      });

      if (minAmount !== undefined) params.append('minAmount', minAmount.toString());
      if (maxAmount !== undefined) params.append('maxAmount', maxAmount.toString());
      if (searchCity) params.append('searchCity', searchCity);
      if (searchPropertyType) params.append('searchPropertyType', searchPropertyType);

      const response = await fetch(`${API_BASE_URL}/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  static async getPropertyById(id: string): Promise<DatabaseProperty | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/property/${id}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Get property failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get property error:', error);
      return null;
    }
  }

  static async getTotalPropertyCount(): Promise<number> {
    try {
      const response = await fetch(`${API_BASE_URL}/count`);
      
      if (!response.ok) {
        throw new Error(`Get count failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('Count service error:', error);
      return 0;
    }
  }

  static async getPropertyTypes(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/property-types`);
      
      if (!response.ok) {
        throw new Error(`Get property types failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Property types service error:', error);
      return [];
    }
  }
}

