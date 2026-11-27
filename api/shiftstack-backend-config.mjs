export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const url = String(process.env.SHIFTSTACK_SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = String(process.env.SHIFTSTACK_SUPABASE_PUBLISHABLE_KEY || '');

  if (!url || !publishableKey) {
    return res.status(503).json({
      ready: false,
      error: 'ShiftStack marketplace backend is not configured yet.'
    });
  }

  return res.status(200).json({
    ready: true,
    url,
    publishableKey
  });
}
