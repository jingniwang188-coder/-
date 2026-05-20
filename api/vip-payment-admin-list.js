import { ensureVipSchema, pool } from './_db.js';

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = origin && allowed.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function mapOrder(row) {
  return {
    orderId: row.order_id,
    status: row.status,
    productType: row.product_type,
    amountFen: row.amount_fen,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    paidAt: row.paid_at ? Number(row.paid_at) : null,
    unlockConsumedAt: row.unlock_consumed_at ? Number(row.unlock_consumed_at) : null,
    paymentChannel: row.payment_channel,
    paymentTxnId: row.payment_txn_id,
    callbackReceivedAt: row.callback_received_at ? Number(row.callback_received_at) : null,
    claim: row.claim_payload || null,
    claimAt: row.claim_created_at ? Number(row.claim_created_at) : null
  };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只接受 POST 请求' });

  const adminKey = process.env.VIP_ADMIN_KEY;
  if (!adminKey) return res.status(503).json({ error: 'VIP_ADMIN_KEY 未配置' });

  const provided = String(req.body?.adminKey || '').trim();
  if (!provided || provided !== adminKey) {
    return res.status(401).json({ error: '管理密钥错误' });
  }

  await ensureVipSchema();
  await pool.query(`
    UPDATE vip_payment_orders
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= $1
  `, [Date.now()]);

  const result = await pool.query(`
    SELECT
      o.*,
      e.payload AS claim_payload,
      e.created_at AS claim_created_at
    FROM vip_payment_orders o
    LEFT JOIN LATERAL (
      SELECT payload, created_at
      FROM vip_payment_events
      WHERE order_id = o.order_id
        AND type = 'manual_payment_claim'
      ORDER BY created_at DESC
      LIMIT 1
    ) e ON TRUE
    ORDER BY
      CASE WHEN o.status = 'pending' AND e.created_at IS NOT NULL THEN 0 ELSE 1 END,
      o.created_at DESC
    LIMIT 60
  `);

  return res.status(200).json({
    orders: result.rows.map(mapOrder)
  });
}
