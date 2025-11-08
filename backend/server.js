// server.js - API Studio Adriana Soares
// PostgreSQL + Express
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Teste de conexão ao iniciar
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erro ao conectar no PostgreSQL:', err.message);
    process.exit(1); // Encerra se não conectar
  } else {
    console.log('✅ Conectado ao PostgreSQL:', res.rows[0].now);
  }
});

// ========================================
// ROTAS DA API
// ========================================

// Rota raiz - informações da API
app.get('/', (req, res) => {
  res.json({ 
    mensagem: '💅 API Studio Adriana Soares',
    versao: '1.0.0',
    status: 'online',
    endpoints: [
      'GET  /api/servicos - Lista todos os serviços',
      'POST /api/agendar - Cria novo agendamento',
      'GET  /api/disponibilidade?data=YYYY-MM-DD - Horários ocupados',
      'GET  /api/health - Status da API'
    ]
  });
});

// Health check - verificar se API está funcionando
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: err.message 
    });
  }
});

// Buscar todos os serviços
app.get('/api/servicos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id_servico, nome_servico FROM pi2.tb_servico ORDER BY id_servico'
    );
    
    console.log(`📋 ${result.rows.length} serviços retornados`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Erro ao buscar serviços:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar serviços',
      detalhes: err.message 
    });
  }
});

// Criar novo agendamento
app.post('/api/agendar', async (req, res) => {
  try {
    const { nome, telefone, servico, data, hora } = req.body;
    
    // Validação básica
    if (!nome || !telefone || !servico || !data || !hora) {
      return res.status(400).json({ 
        sucesso: false, 
        erro: 'Todos os campos são obrigatórios',
        campos_recebidos: { nome: !!nome, telefone: !!telefone, servico: !!servico, data: !!data, hora: !!hora }
      });
    }

    // Validações adicionais
    if (nome.trim().length < 3) {
      return res.status(400).json({ 
        sucesso: false, 
        erro: 'Nome deve ter pelo menos 3 caracteres' 
      });
    }

    if (telefone.trim().length < 10) {
      return res.status(400).json({ 
        sucesso: false, 
        erro: 'Telefone inválido' 
      });
    }
    
    // Inserir no banco
    const result = await pool.query(
      `INSERT INTO pi2.tb_agendamento 
       (nome, telefone, servico, data_agendamento, hora_agendamento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_agendamento, data_criacao`,
      [nome.trim(), telefone.trim(), servico, data, hora]
    );
    
    const agendamento = result.rows[0];
    
    console.log(`✅ Agendamento #${agendamento.id_agendamento} criado: ${nome} - ${servico} em ${data} às ${hora}`);
    
    res.status(201).json({ 
      sucesso: true, 
      id: agendamento.id_agendamento,
      mensagem: 'Agendamento realizado com sucesso!',
      dados: {
        nome,
        servico,
        data,
        hora,
        criado_em: agendamento.data_criacao
      }
    });
  } catch (err) {
    console.error('❌ Erro ao criar agendamento:', err);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro ao realizar agendamento',
      detalhes: err.message 
    });
  }
});

// Verificar disponibilidade de horários em uma data
app.get('/api/disponibilidade', async (req, res) => {
  try {
    const { data } = req.query;
    
    if (!data) {
      return res.status(400).json({ 
        erro: 'Parâmetro "data" é obrigatório',
        exemplo: '/api/disponibilidade?data=2025-11-10'
      });
    }

    // Validar formato da data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ 
        erro: 'Data deve estar no formato YYYY-MM-DD',
        recebido: data
      });
    }
    
    const result = await pool.query(
      `SELECT hora_agendamento, nome, servico
       FROM pi2.tb_agendamento 
       WHERE data_agendamento = $1
       ORDER BY hora_agendamento`,
      [data]
    );
    
    console.log(`📅 ${result.rows.length} horários ocupados em ${data}`);
    
    res.json({
      data,
      total_agendamentos: result.rows.length,
      horarios_ocupados: result.rows
    });
  } catch (err) {
    console.error('❌ Erro ao verificar disponibilidade:', err);
    res.status(500).json({ 
      erro: 'Erro ao verificar disponibilidade',
      detalhes: err.message 
    });
  }
});

// Buscar todos os agendamentos (útil para futura área admin)
app.get('/api/agendamentos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id_agendamento, nome, telefone, servico, 
              data_agendamento, hora_agendamento, data_criacao
       FROM pi2.tb_agendamento 
       ORDER BY data_agendamento DESC, hora_agendamento DESC
       LIMIT 100`
    );
    
    res.json({
      total: result.rows.length,
      agendamentos: result.rows
    });
  } catch (err) {
    console.error('❌ Erro ao buscar agendamentos:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar agendamentos',
      detalhes: err.message 
    });
  }
});

// Deletar agendamento
app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM pi2.tb_agendamento WHERE id_agendamento = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        sucesso: false, 
        erro: 'Agendamento não encontrado' 
      });
    }
    
    console.log(`🗑️ Agendamento #${id} excluído`);
    
    res.json({ 
      sucesso: true, 
      mensagem: 'Agendamento excluído com sucesso',
      agendamento: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Erro ao excluir:', err);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro ao excluir agendamento' 
    });
  }
});

// Rota 404 - não encontrada
app.use((req, res) => {
  res.status(404).json({ 
    erro: 'Rota não encontrada',
    url: req.originalUrl,
    metodo: req.method
  });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💅 Studio Adriana Soares - API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});