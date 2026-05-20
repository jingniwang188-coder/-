import { getVipPaymentOrder, saveVipPaymentEvent } from './_vipPaymentRepository.js';

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

function cleanText(value, maxLength = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只接受 POST 请求' });

  const orderId = cleanText(req.body?.orderId, 80);
  if (!orderId) return res.status(400).json({ error: '缺少 orderId' });

  const order = await getVipPaymentOrder(orderId);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status === 'expired') return res.status(410).json({ error: '订单已过期，请重新发起支付' });

  const claim = {
    payerName: cleanText(req.body?.payerName, 80),
    paidAtText: cleanText(req.body?.paidAtText, 120),
    contact: cleanText(req.body?.contact, 160),
    note: cleanText(req.body?.note, 600),
    page: cleanText(req.body?.page, 500),
    userAgent: cleanText(req.headers['user-agent'], 300),
    submittedAt: new Date().toISOString(),
    orderStatus: order.status,
    amountFen: Number(order.amountFen || 0),
    productType: order.productType || ''
  };

  if (!claim.payerName && !claim.contact && !claim.note) {
    return res.status(400).json({ error: '请至少填写付款备注、昵称或联系方式之一' });
  }

  await saveVipPaymentEvent({
    type: 'manual_payment_claim',
    orderId,
    transactionId: '',
    payload: claim
  });

  return res.status(200).json({
    ok: true,
    orderId,
    status: order.status,
    message: order.status === 'paid' || order.status === 'unlocked'
      ? '订单已确认，系统会继续解锁。'
      : '已提交付款信息，等待人工确认。'
  });
}
