import dbService from '../services/db.service.js';

export const getManualGateway = async (req, res) => {
  try {
    const type = String(req.query.type || 'wire');

    // Try Prisma model first if available
    let row = null;
    try {
      // If Prisma has the model (schema.prisma defines `manual_gateway`)
      // use findFirst. Some deployments may not generate this model; fall back to raw.
      if (dbService.prisma.manual_gateway) {
        row = await dbService.prisma.manual_gateway.findFirst({
          where: { type, is_active: true },
          orderBy: { id: 'desc' },
        });
      }
    } catch (_) {}

    if (!row) {
      // Fallback using raw SQL for broader compatibility
      const rows = await dbService.prisma.$queryRawUnsafe(
        `SELECT * FROM "manual_gateway" WHERE type='${type}' AND is_active = true ORDER BY id DESC LIMIT 1`
      );
      row = rows?.[0] || null;
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Gateway not found' });
    }

    // Try to extract bank details either from explicit columns or JSON/plaintext in details
    let bank = {
      bankName: row.bank_name || null,
      accountName: row.account_name || null,
      accountNumber: row.account_number || null,
      ifscCode: row.ifsc_code || null,
      swiftCode: row.swift_code || null,
      accountType: row.account_type || null,
      countryCode: row.country_code || null,
    };

    // If not present as columns, parse details JSON or key:value text
    if (!bank.bankName && row.details) {
      const raw = row.details;
      // Try JSON first
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        bank = {
          bankName: parsed.bankName || parsed.bank_name || null,
          accountName: parsed.accountName || parsed.account_name || null,
          accountNumber: parsed.accountNumber || parsed.account_number || null,
          ifscCode: parsed.ifscCode || parsed.ifsc_code || null,
          swiftCode: parsed.swiftCode || parsed.swift_code || null,
          accountType: parsed.accountType || parsed.account_type || null,
          countryCode: parsed.countryCode || parsed.country_code || null,
        };
      } catch (_) {
        // Fallback: parse plaintext lines like "Bank: X", "Account: Y", etc.
        try {
          const text = String(raw);
          const lines = text.split(/\r?\n|<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
          const map = new Map();
          for (const l of lines) {
            const m = l.match(/^(.*?):\s*(.*)$/);
            if (m) map.set(m[1].toLowerCase(), m[2]);
          }
          const val = (kArr) => {
            for (const k of kArr) { const v = map.get(k); if (v) return v; }
            return null;
          };
          bank = {
            bankName: val(['bank', 'bank name']),
            accountName: val(['account', 'account name', 'accname']),
            accountNumber: val(['number', 'account number', 'acc no', 'acc number']),
            ifscCode: val(['ifsc', 'ifsc code']),
            swiftCode: val(['swift', 'swift code', 'ifsc/swift', 'ifsc / swift']),
            accountType: val(['type', 'account type']),
            countryCode: val(['country', 'country code']),
          };
        } catch (_) {}
      }
    }

    return res.status(200).json({ success: true, data: { type, name: row.name, bank } });
  } catch (error) {
    console.error('Error fetching manual gateway:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
