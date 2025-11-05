import type { UnclaimedProperty } from '../types/Property';
import type { CheckoutData as BaseCheckoutData } from '../stores/CartStore';
import type { TaxReturnData } from './chartService';

// We're adding 'ssn' which is required for the DocuSign template.
// This assumes CartStore's CheckoutData will be updated to include it.
export interface CheckoutData extends BaseCheckoutData {
  ssn: string;
}

export interface FormData {
  properties: UnclaimedProperty[];
  claimantData: CheckoutData;
  taxReturns?: TaxReturnData[];
}

export class PDFService {
  static async sendForSignature(formData: FormData): Promise<string> {
    try {
      console.log('Preparing data for DocuSign template...');
      const { properties, claimantData, taxReturns } = formData;

      const claimantAddress = [
        claimantData.address.street1,
        claimantData.address.street2,
        `${claimantData.address.city}, ${claimantData.address.state} ${claimantData.address.zipCode}`
      ].filter(Boolean).join(', ');

      const templateData: { [key: string]: string } = {
        // Claimant Info
        claimant_name: `${claimantData.firstName} ${claimantData.lastName}`,
        claimant_email: claimantData.email,
        claimant_phone: claimantData.phone || '',
        claimant_mailing_address: claimantAddress || '',
        claimant_ssn: claimantData.ssn,

        // TODO: Replace with secure configuration (e.g., environment variables)
        investigator_name: 'John Doe Investigator',
        investigator_email: 'investigator@example.com',
        investigator_phone: '555-123-4567',
        investigator_ssn: '999-99-9999',

        // Tax return information (if available)
        has_tax_returns: taxReturns && taxReturns.length > 0 ? 'Yes' : 'No',
        tax_return_count: taxReturns ? taxReturns.length.toString() : '0',
      };

      // Initialize all property-related fields to empty strings
      const propFields = [
          'account_type', 'amount', 'owner_address', 'owner_name',
          'property_id', 'reported_by', 'securities'
      ];
      const suffixes = ['_primary', '_1', '_2', '_3', '_4'];
      suffixes.forEach(suffix => {
          propFields.forEach(field => {
              templateData[`${field}${suffix}`] = '';
          });
      });

      // Populate data for up to 5 properties
      properties.slice(0, 5).forEach((property, index) => {
          const suffix = suffixes[index];
          const ownerAddress = [
              property.ownerStreet1,
              property.ownerStreet2,
              property.ownerCity,
              property.ownerState,
              property.ownerZip
          ].filter(Boolean).join(', ');
          
          templateData[`owner_name${suffix}`] = property.ownerName;
          templateData[`owner_address${suffix}`] = ownerAddress;
          templateData[`property_id${suffix}`] = property.id?.split('_')?.[0] || '';
          templateData[`amount${suffix}`] = `$${property.currentCashBalance.toLocaleString()}`;
          templateData[`account_type${suffix}`] = property.propertyType;
          templateData[`reported_by${suffix}`] = property.holderName;
          templateData[`securities${suffix}`] = `${property.sharesReported}`;
      });

      console.log('Invoking Netlify function to send from template...', { templateData });
      
      const response = await fetch('/.netlify/functions/docusign-send-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          templateData,
          origin: window.location.origin
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to send for signature: ${errorData.error || response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully sent for signature via Netlify function.', data);

      if (!data.redirectUrl) {
        throw new Error('Did not receive a redirect URL for signing.');
      }
      
      return data.redirectUrl;

    } catch (error) {
      console.error('Error in sendForSignature:', error);
      throw new Error(`Failed to send for signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 