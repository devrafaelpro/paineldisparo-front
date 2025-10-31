import { useState, useEffect, useRef } from 'react'

const Painel = ({ token, onLogout }) => {
  const [campaignName, setCampaignName] = useState('')
  const [leadsText, setLeadsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState({
    total: 0,
    sent: 0,
    campaignName: '',
    status: 'idle',
    leads: []
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
        setIsSending(data.status === 'running')
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
    if (progress.status === 'running' || isSending) {
      setError('Já existe uma campanha em execução. Aguarde ou pare a campanha atual.')
      return
    }

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
        setIsSending(true)
        // Não limpa os campos, mantém visível
      } else {
        setError(data.error || 'Erro ao iniciar disparo')
      }
    } catch (err) {
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setIsSending(false)
      } else {
        setError(data.error || 'Erro ao parar disparo')
      }
    } catch (err) {
      setError('Erro de conexão com o servidor')
    }
  }

  const handleReset = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setCampaignName('')
        setLeadsText('')
        setIsSending(false)
        setError('')
      }
    } catch (err) {
      setError('Erro ao resetar painel')
    }
  }

  const downloadPlanilha = (todos = true) => {
    if (!progress.leads || progress.leads.length === 0) {
      setError('Nenhum lead para exportar')
      return
    }

    let leadsToExport = []

    if (todos) {
      // Exporta todos os leads com status
      leadsToExport = progress.leads.map(lead => ({
        Nome: lead.name,
        Telefone: lead.phone,
        Status: lead.status === 'success' ? 'Sucesso' : 
                lead.status === 'error' ? 'Erro' : 
                lead.status === 'not_sent' ? 'Não Enviado' : 'Pendente',
        'Enviado Em': lead.sentAt || '-'
      }))
    } else {
      // Exporta apenas os não enviados
      leadsToExport = progress.leads
        .filter(lead => lead.status === 'pending' || lead.status === 'not_sent')
        .map(lead => ({
          Nome: lead.name,
          Telefone: lead.phone
        }))
    }

    if (leadsToExport.length === 0) {
      setError(todos ? 'Nenhum lead para exportar' : 'Todos os leads foram enviados')
      return
    }

    // Converte para CSV
    const headers = Object.keys(leadsToExport[0])
    const csvContent = [
      headers.join(','),
      ...leadsToExport.map(row => 
        headers.map(header => `"${row[header] || ''}"`).join(',')
      )
    ].join('\n')

    // Cria e baixa o arquivo
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', todos ? 
      `${progress.campaignName || 'leads'}_todos.csv` : 
      `${progress.campaignName || 'leads'}_nao_enviados.csv`
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getStatusText = (status) => {
    const statusMap = {
      idle: 'Aguardando',
      running: 'Em execução',
      stopped: 'Parado',
      done: 'Concluído'
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status) => {
    const colorMap = {
      idle: '#757575',
      running: '#1976d2',
      stopped: '#f57c00',
      done: '#2e7d32'
    }
    return colorMap[status] || '#757575'
  }

  const getLeadStatusColor = (status) => {
    const colorMap = {
      success: '#4caf50',
      error: '#f44336',
      pending: '#ff9800',
      not_sent: '#9e9e9e'
    }
    return colorMap[status] || '#9e9e9e'
  }

  const getLeadStatusText = (status) => {
    const statusMap = {
      success: 'Enviado',
      error: 'Erro',
      pending: 'Pendente',
      not_sent: 'Não Enviado'
    }
    return statusMap[status] || 'Desconhecido'
  }

  const percentage = progress.total > 0 
    ? Math.round((progress.sent / progress.total) * 100) 
    : 0

  const leadsEnviados = progress.leads?.filter(l => l.status === 'success').length || 0
  const leadsErro = progress.leads?.filter(l => l.status === 'error').length || 0
  const leadsPendentes = progress.leads?.filter(l => l.status === 'pending' || l.status === 'not_sent').length || 0

  const showLeadsView = progress.status !== 'idle' && progress.leads && progress.leads.length > 0

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1400px',
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

        {!showLeadsView ? (
          /* Formulário de Nova Campanha */
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            maxWidth: '800px',
            margin: '0 auto'
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
                disabled={isSending}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  opacity: isSending ? 0.6 : 1
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
                disabled={isSending}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  opacity: isSending ? 0.6 : 1
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

            <div style={{
              display: 'flex',
              gap: '10px'
            }}>
              <button
                onClick={handleIniciarDisparo}
                disabled={loading || isSending}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: '#2e7d32',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: (loading || isSending) ? 'not-allowed' : 'pointer',
                  opacity: (loading || isSending) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {loading ? 'Enviando...' : isSending ? '⏸️ Aguardando...' : '▶️ Iniciar Disparo'}
              </button>
            </div>
          </div>
        ) : (
          /* Tela de Acompanhamento */
          <div>
            {/* Header da Campanha */}
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <div>
                  <h2 style={{ margin: 0, color: '#333' }}>{progress.campaignName || 'Campanha'}</h2>
                  <div style={{
                    marginTop: '8px',
                    fontSize: '14px',
                    color: '#757575'
                  }}>
                    Status: <span style={{ 
                      color: getStatusColor(progress.status),
                      fontWeight: '500'
                    }}>
                      {getStatusText(progress.status)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {progress.status === 'running' && (
                    <button
                      onClick={handleStop}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#f57c00',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      ⏹️ Parar
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    disabled={progress.status === 'running'}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#1976d2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: progress.status === 'running' ? 'not-allowed' : 'pointer',
                      opacity: progress.status === 'running' ? 0.6 : 1,
                      fontWeight: '500'
                    }}
                  >
                    ✨ Enviar Novos Leads
                  </button>
                </div>
              </div>

              {/* Estatísticas */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '15px',
                marginBottom: '20px'
              }}>
                <div style={{
                  padding: '15px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#1976d2' }}>
                    {progress.sent} / {progress.total}
                  </div>
                  <div style={{ fontSize: '12px', color: '#757575', marginTop: '4px' }}>
                    Enviados
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  backgroundColor: '#e8f5e9',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#4caf50' }}>
                    {leadsEnviados}
                  </div>
                  <div style={{ fontSize: '12px', color: '#757575', marginTop: '4px' }}>
                    Sucesso
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  backgroundColor: '#ffebee',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#f44336' }}>
                    {leadsErro}
                  </div>
                  <div style={{ fontSize: '12px', color: '#757575', marginTop: '4px' }}>
                    Erros
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  backgroundColor: '#fff3e0',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#ff9800' }}>
                    {leadsPendentes}
                  </div>
                  <div style={{ fontSize: '12px', color: '#757575', marginTop: '4px' }}>
                    Pendentes
                  </div>
                </div>
              </div>

              {/* Barra de Progresso */}
              {progress.total > 0 && (
                <div>
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

              {/* Botões de Download */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginTop: '20px'
              }}>
                <button
                  onClick={() => downloadPlanilha(true)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  📥 Baixar Planilha Completa
                </button>
                <button
                  onClick={() => downloadPlanilha(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  📥 Baixar Não Enviados
                </button>
              </div>
            </div>

            {/* Lista de Leads */}
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
                Leads ({progress.leads?.length || 0})
              </h3>
              <div style={{
                maxHeight: '500px',
                overflowY: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: '4px'
              }}>
                {progress.leads && progress.leads.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{
                      backgroundColor: '#f5f5f5',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1
                    }}>
                      <tr>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Nome</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Telefone</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.leads.map((lead, index) => (
                        <tr key={index} style={{
                          borderBottom: '1px solid #e0e0e0',
                          backgroundColor: lead.status === 'success' ? '#f1f8e9' : 
                                         lead.status === 'error' ? '#ffebee' : 
                                         lead.status === 'pending' ? '#fff3e0' : '#fafafa'
                        }}>
                          <td style={{ padding: '12px' }}>{lead.name}</td>
                          <td style={{ padding: '12px' }}>{lead.phone}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              backgroundColor: getLeadStatusColor(lead.status),
                              color: 'white',
                              fontSize: '12px',
                              fontWeight: '500'
                            }}>
                              {getLeadStatusText(lead.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#757575' }}>
                    Nenhum lead disponível
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Painel
