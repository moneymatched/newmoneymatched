# AWS Database Migrations

This directory contains database migrations for AWS RDS PostgreSQL, organized to mirror the Supabase migration structure.

## Directory Structure

```
aws/
├── migrations/           # SQL migration files
│   └── 20250713004242_search_properties_fast.sql
├── migrate.js           # Migration runner script
└── README.md           # This file
```

## Migration Files

Migration files follow the naming convention: `YYYYMMDDHHMMSS_description.sql`

- **20250713004242_search_properties_fast.sql** - Fast search function with GIN indexes

## Running Migrations

### Prerequisites

1. **Environment Variables**: Set up your AWS database connection:
   ```bash
   export AWS_DB_HOST="your-rds-endpoint.region.rds.amazonaws.com"
   export AWS_DB_PORT="5432"
   export AWS_DB_NAME="postgres"
   export AWS_DB_USER="your_username"
   export AWS_DB_PASSWORD="your_password"
   export AWS_DB_SSL="require"
   ```

2. **Dependencies**: Ensure `pg` package is installed:
   ```bash
   npm install pg
   ```

### Commands

#### Run Migrations (AWS)
```bash
node aws/migrate.js
```

#### Run Migrations (Local Development)
```bash
node aws/migrate.js --local
```

#### Check Migration Status
```bash
node aws/migrate.js status
```

#### Check Local Migration Status
```bash
node aws/migrate.js status --local
```

## Migration Tracking

The migration runner creates a `schema_migrations` table to track which migrations have been applied:

```sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) UNIQUE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Integration with Import Scripts

The migration system is designed to work alongside your existing import scripts:

1. **Run migrations first** to set up the schema
2. **Run import scripts** to populate data
3. **Migrations handle schema changes** (indexes, functions, etc.)
4. **Import scripts handle data** (tables, data population)

## Adding New Migrations

1. Create a new SQL file in `aws/migrations/` with timestamp prefix
2. Run `node aws/migrate.js` to apply the migration
3. The migration will be tracked and won't run again

## Migration vs Import Scripts

- **Migrations**: Schema changes (CREATE TABLE, CREATE INDEX, CREATE FUNCTION, etc.)
- **Import Scripts**: Data operations (INSERT, UPDATE, data processing)

This separation allows you to:
- Version control schema changes
- Apply schema changes independently of data imports
- Roll back schema changes if needed
- Track which schema changes have been applied

## Best Practices

1. **Always test migrations locally first**:
   ```bash
   node aws/migrate.js --local
   ```

2. **Check status before running**:
   ```bash
   node aws/migrate.js status
   ```

3. **Keep migrations idempotent** - they should be safe to run multiple times

4. **Use IF NOT EXISTS** for tables and indexes to avoid conflicts

5. **Test with your import scripts** to ensure compatibility
