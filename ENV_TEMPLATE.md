# Backend Environment Variables Template

Create a `.env` file in the `zuperior-server` directory with these variables:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/crm_database"

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here

# Server Configuration
PORT=5000
NODE_ENV=development

# Client URL (CORS) - comma separated for multiple origins
CLIENT_URL=http://localhost:3000,http://localhost:3001

# Cregis Payment Engine (Deposits)
CREGIS_PAYMENT_PROJECT_ID=1435226128711680
CREGIS_PAYMENT_API_KEY=afe05cea1f354bc0a9a484e139d5f4af

# Cregis WaaS (Withdrawals)
CREGIS_WAAS_PROJECT_ID=1435226266132480
CREGIS_WAAS_API_KEY=f2ce7723128e4fdb88daf9461fce9562

# Cregis Gateway URL (Test environment)
CREGIS_GATEWAY_URL=https://t-rwwagnvw.cregis.io

# Email Service (Optional - if using email notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# MT5 API Configuration (Optional - if direct MT5 integration)
MT5_API_URL=http://your-mt5-api.com
MT5_API_KEY=your_mt5_api_key
```

## Instructions

1. Copy the above content
2. Create a file: `zuperior-server/.env`
3. Paste the content
4. Update the values for:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `JWT_SECRET` - A secure random string
   - Other values as needed

## Notes

- The Cregis credentials above are test credentials
- For production, get production credentials from Cregis
- Never commit `.env` file to git (already in `.gitignore`)
- Keep API keys secure


