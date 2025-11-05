import type { UnclaimedProperty } from '../types/Property';
import type { SearchPropertyResult } from '../services/awsClient';

/**
 * Convert database property (underscore_case) to frontend format (camelCase)
 * This utility function centralizes the conversion logic used across the application
 */
export const convertDatabaseProperty = (dbProperty: SearchPropertyResult): UnclaimedProperty => {
  return {
    id: dbProperty.id,
    propertyType: dbProperty.property_type,
    cashReported: parseFloat(dbProperty.cash_reported) || 0,
    sharesReported: parseInt(dbProperty.shares_reported) || 0,
    nameOfSecuritiesReported: dbProperty.name_of_securities_reported || '',
    numberOfOwners: dbProperty.number_of_owners,
    ownerName: dbProperty.owner_name,
    // Use full address as street1 if available, otherwise try individual fields
    ownerStreet1: dbProperty.owner_full_address || dbProperty.owner_street_1 || '',
    ownerStreet2: dbProperty.owner_street_2 || '',
    ownerStreet3: dbProperty.owner_street_3 || '',
    ownerCity: dbProperty.owner_city || '',
    ownerState: dbProperty.owner_state || '',
    ownerZip: dbProperty.owner_zip || '',
    ownerCountryCode: dbProperty.owner_country_code || '',
    currentCashBalance: parseFloat(dbProperty.current_cash_balance || '0') || 0,
    numberOfPendingClaims: parseInt(dbProperty.number_of_pending_claims) || 0,
    numberOfPaidClaims: parseInt(dbProperty.number_of_paid_claims) || 0,
    holderName: dbProperty.holder_name,
    // Use full address as street1 if available, otherwise try individual fields
    holderStreet1: dbProperty.holder_full_address || dbProperty.holder_street_1 || '',
    holderStreet2: dbProperty.holder_street_2 || '',
    holderStreet3: dbProperty.holder_street_3 || '',
    holderCity: dbProperty.holder_city || '',
    holderState: dbProperty.holder_state || '',
    holderZip: dbProperty.holder_zip || '',
    cusip: dbProperty.cusip || ''
  };
};
