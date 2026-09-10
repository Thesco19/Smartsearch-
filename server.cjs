const express = require('express');
const app = express();

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Servidor rodando corretamente!',
  });
});

const PORT = 50000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SmartCam Server] Rodando na porta ${PORT}`);
});