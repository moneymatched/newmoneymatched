import { Handler } from '@netlify/functions';
import pg from 'pg';

// AWS PostgreSQL configuration
const AWS_DB_CONFIG = {
  host: process.env.AWS_DB_HOST || "",
  port: parseInt(process.env.AWS_DB_PORT || '5432'),
  database: process.env.AWS_DB_NAME || "postgres",
  user: process.env.AWS_DB_USER || "postgres",
  password: process.env.AWS_DB_PASSWORD || "",
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 300000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 0,
};

// Initialize PostgreSQL client pool
const pool = new pg.Pool(AWS_DB_CONFIG);

export const handler: Handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const { httpMethod, path, queryStringParameters, body } = event;

    if (httpMethod === 'GET') {
      if (path.includes('/search')) {
        return await handleSearch(queryStringParameters);
      } else if (path.includes('/property/')) {
        const id = path.split('/property/')[1];
        return await handleGetProperty(id);
      } else if (path.includes('/count')) {
        return await handleGetCount();
      } else if (path.includes('/property-types')) {
        return await handleGetPropertyTypes();
      }
    } else if (httpMethod === 'POST') {
      if (path.includes('/properties-by-ids')) {
        return await handleGetPropertiesByIds(body);
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('Property search error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleSearch(params: any) {
  const {
    searchName,
    minAmount,
    maxAmount,
    searchCity,
    searchPropertyType,
    limit = '50'
  } = params || {};

  if (!searchName) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'searchName is required' }),
    };
  }

  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM search_properties_fast($1, $2, $3, $4, $5, $6)',
      [
        searchName,
        minAmount ? parseFloat(minAmount) : null,
        maxAmount ? parseFloat(maxAmount) : null,
        searchCity || null,
        searchPropertyType || null,
        parseInt(limit)
      ]
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify(result.rows || []),
    };
  } catch (error) {
    console.error('Search failed:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Search failed' }),
    };
  } finally {
    client.release();
  }
}

async function handleGetProperty(id: string) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM unclaimed_properties WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
        body: JSON.stringify({ error: 'Property not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify(result.rows[0]),
    };
  } catch (error) {
    console.error('Get property error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Failed to get property' }),
    };
  } finally {
    client.release();
  }
}

async function handleGetCount() {
  const client = await pool.connect();
  
  try {
    const result = await client.query('SELECT COUNT(*) FROM unclaimed_properties');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ count: parseInt(result.rows[0].count) }),
    };
  } catch (error) {
    console.error('Count service error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Failed to get count' }),
    };
  } finally {
    client.release();
  }
}

async function handleGetPropertyTypes() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT DISTINCT property_type FROM unclaimed_properties WHERE property_type IS NOT NULL ORDER BY property_type'
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify(result.rows.map(row => row.property_type)),
    };
  } catch (error) {
    console.error('Property types service error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Failed to get property types' }),
    };
  } finally {
    client.release();
  }
}

async function handleGetPropertiesByIds(body: string) {
  try {
    const { propertyIds } = JSON.parse(body);
    
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
        body: JSON.stringify({ error: 'Invalid property IDs' }),
      };
    }

    const client = await pool.connect();
    
    try {
      const placeholders = propertyIds.map((_, index) => `$${index + 1}`).join(',');
      const query = `
        SELECT * FROM unclaimed_properties 
        WHERE id IN (${placeholders})
        ORDER BY current_cash_balance DESC
      `;
      
      const result = await client.query(query, propertyIds);
      
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
        body: JSON.stringify({ 
          properties: result.rows,
          count: result.rows.length 
        }),
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching properties by IDs:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
