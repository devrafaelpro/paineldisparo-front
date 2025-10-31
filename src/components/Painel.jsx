import { useState, useEffect, useRef } from 'react'

const Painel = ({ token, onLogout }) => {
  const [campaignName, setCampaignName] = useState('')
  const [leadsText, setLeadsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({
    total: 0,
    sent: 0,
    campaignName: '',
    status: 'idle'
  })

  const eventSourceRef = useRef(null)
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

  useEffect(() => {
    // Abre conexão SSE ao montar o componente
    const eventSource = new EventSource(`${BACKEND_URL}/api/progress/stream?token=${token}`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setProgress(data)
      } catch (err) {
        console.error('Erro ao parsear mensagem SSE:', err)
      }
    }

    eventSource.onerror = (err) => {
      console.error('Erro na conexão SSE:', err)
    }

    return () => {
      // Fecha conexão ao desmontar
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [token, BACKEND_URL])

  const parseLeads = (text) => {
    const lines = text.trim().split('\n')
    const leads = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split(',').map(p => p.trim())
      if (parts.length >= 2) {
        leads.push({
          name: parts[0],
          phone: parts[1]
        })
      }
    }

    return leads
  }

  const handleIniciarDisparo = async () => {
    if (!campaignName.trim()) {
      setError('Digite o nome da campanha')
      return
    }

    if (!leadsText.trim()) {
      setError('Cole a lista de leads')
      return
    }

    const leads = parseLeads(leadsText)

    if (leads.length === 0) {
      setError('Nenhum lead válido encontrado. Formato: nome,telefone')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${BACKEND_URL}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignName: campaignName.trim(),
          leads
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Limpa o campo de leads
        setLeadsText('')
      } else {
        setError(data.error || 'Erro ao iniciar disparo')
      }
    } catch (err) {
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  const getStatusText = (status) => {
    const statusMap = {
      idle: 'Aguardando',
      running: 'Em execução',
      done: 'Concluído'
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status) => {
    const colorMap = {
      idle: '#757575',
      running: '#1976d2',
      done: '#2e7d32'
    }
    return colorMap[status] || '#757575'
  }

  const percentage = progress.total > 0 
    ? Math.round((progress.sent / progress.total) * 100) 
    : 0

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ margin: 0, color: '#333' }}>Painel de Disparo</h1>
          <button
            onClick={onLogout}
            style={{
              padding: '10px 20px',
              backgroundColor: '#d32f2f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Sair
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 400px',
          gap: '20px'
        }}>
          {/* Formulário */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: '20px',
              color: '#333'
            }}>
              Nova Campanha
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: '#555',
                fontWeight: '500'
              }}>
                Nome da Campanha
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ex: Campanha WhatsApp"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: '#555',
                fontWeight: '500'
              }}>
                Leads (formato: nome,telefone - um por linha)
              </label>
              <textarea
                value={leadsText}
                onChange={(e) => setLeadsText(e.target.value)}
                placeholder="João,5511999999999&#10;Maria,5511933334444"
                rows={15}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            {error && (
              <div style={{
                color: '#d32f2f',
                marginBottom: '20px',
                padding: '10px',
                backgroundColor: '#ffebee',
                borderRadius: '4px'
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleIniciarDisparo}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#2e7d32',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Enviando...' : 'Iniciar Disparo'}
            </button>
          </div>

          {/* Painel de Progresso */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            height: 'fit-content'
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: '20px',
              color: '#333'
            }}>
              Progresso
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '14px',
                color: '#757575',
                marginBottom: '4px'
              }}>
                Campanha
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '500',
                color: '#333'
              }}>
                {progress.campaignName || '-'}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '14px',
                color: '#757575',
                marginBottom: '4px'
              }}>
                Status
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '500',
                color: getStatusColor(progress.status)
              }}>
                {getStatusText(progress.status)}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '14px',
                color: '#757575',
                marginBottom: '4px'
              }}>
                Enviados / Total
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#333'
              }}>
                {progress.sent} / {progress.total}
              </div>
            </div>

            {progress.total > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '14px',
                  color: '#757575',
                  marginBottom: '8px'
                }}>
                  Progresso ({percentage}%)
                </div>
                <div style={{
                  width: '100%',
                  height: '30px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '15px',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: '#2e7d32',
                    transition: 'width 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {percentage > 5 && `${percentage}%`}
                  </div>
                </div>
              </div>
            )}

            {progress.total === 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#757575',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px'
              }}>
                Nenhuma campanha em execução
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Painel

