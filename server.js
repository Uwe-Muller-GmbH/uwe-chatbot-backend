// 🧪 API: Redis Cache-Status anzeigen
app.get('/api/cache-status', async (req, res) => {
  try {
    const response = await axios.get(`${UPSTASH_URL}/get/faq`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`
      }
    })

    const cached = response.data?.result
    if (cached) {
      return res.json({
        cached: true,
        count: JSON.parse(cached).length
      })
    }

    return res.json({ cached: false })
  } catch (err) {
    console.warn('❌ Fehler beim Cache-Check:', err.message)
    return res.status(500).json({ error: 'Fehler beim Prüfen des Redis-Caches' })
  }
})
