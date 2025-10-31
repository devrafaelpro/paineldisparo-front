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

  // Busca estado atual ao montar o componente
  useEffect(() => {
    const fetchCurrentProgress = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/progress`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          setProgress(data)
          setIsSending(data.status === 'running')
        }
      } catch (err) {
        console.error('Erro ao buscar progresso:', err)
      }
    }

    fetchCurrentProgress()
  }, [token, BACKEND_URL])

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
      leadsToExport = progress.leads.map(lead => ({
        Nome: lead.name,
        Telefone: lead.phone,
        Status: lead.status === 'success' ? 'Sucesso' : 
                lead.status === 'error' ? 'Erro' : 
                lead.status === 'not_sent' ? 'Não Enviado' : 'Pendente',
        'Enviado Em': lead.sentAt || '-'
      }))
    } else {
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

    const headers = Object.keys(leadsToExport[0])
    const csvContent = [
      headers.join(','),
      ...leadsToExport.map(row => 
        headers.map(header => `"${row[header] || ''}"`).join(',')
      )
    ].join('\n')

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
      running: 'Em Execução',
      stopped: 'Parado',
      done: 'Concluído'
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status) => {
    const colorMap = {
      idle: '#9e9e9e',
      running: '#00bcd4',
      stopped: '#ff9800',
      done: '#4caf50'
    }
    return colorMap[status] || '#9e9e9e'
  }

  const getLeadStatusColor = (status) => {
    const colorMap = {
      success: '#4caf50',
      error: '#f44336',
      pending: '#ff9800',
      not_sent: '#616161'
    }
    return colorMap[status] || '#616161'
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
      backgroundColor: '#0f1419',
      backgroundImage: 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)',
      color: '#e0e0e0',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1600px',
        margin: '0 auto'
      }}>
        {/* Header com Logo */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          backgroundColor: '#1a2332',
          padding: '20px 30px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <img 
              src="/fluxione-logo.png" 
              alt="Fluxione Logo" 
              style={{
                height: '50px',
                width: 'auto'
              }}
            />
            <div>
              <h1 style={{ 
                margin: 0, 
                color: '#ffffff',
                fontSize: '24px',
                fontWeight: '600'
              }}>
                Painel de Disparo
              </h1>
              <div style={{
                fontSize: '14px',
                color: '#9e9e9e',
                marginTop: '4px'
              }}>
                Sistema de Gestão de Campanhas
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: '10px 24px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(244, 67, 54, 0.3)'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#d32f2f'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#f44336'}
          >
            Sair
          </button>
        </div>

        {!showLeadsView ? (
          /* Formulário de Nova Campanha */
          <div style={{
            backgroundColor: '#1a2332',
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: '900px',
            margin: '0 auto'
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: '30px',
              color: '#ffffff',
              fontSize: '28px',
              fontWeight: '600'
            }}>
              Nova Campanha
            </h2>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '10px',
                color: '#b0b0b0',
                fontWeight: '500',
                fontSize: '14px'
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
                  padding: '14px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  backgroundColor: '#0f1419',
                  color: '#ffffff',
                  opacity: isSending ? 0.6 : 1,
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#00bcd4'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '10px',
                color: '#b0b0b0',
                fontWeight: '500',
                fontSize: '14px'
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
                  padding: '14px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  backgroundColor: '#0f1419',
                  color: '#ffffff',
                  opacity: isSending ? 0.6 : 1,
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#00bcd4'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
              />
            </div>

            {error && (
              <div style={{
                color: '#ff5252',
                marginBottom: '24px',
                padding: '14px',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(244, 67, 54, 0.3)'
              }}>
                {error}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={handleIniciarDisparo}
                disabled={loading || isSending}
                style={{
                  flex: 1,
                  padding: '16px',
                  backgroundColor: isSending ? '#4caf50' : '#00bcd4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: (loading || isSending) ? 'not-allowed' : 'pointer',
                  opacity: (loading || isSending) ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.3s ease',
                  boxShadow: isSending ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 4px 12px rgba(0, 188, 212, 0.3)'
                }}
                onMouseOver={(e) => {
                  if (!loading && !isSending) e.target.style.transform = 'translateY(-2px)'
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)'
                }}
              >
                {loading ? '⏳ Enviando...' : isSending ? '⏸️ Aguardando...' : '▶️ Iniciar Disparo'}
              </button>
            </div>
          </div>
        ) : (
          /* Tela de Acompanhamento */
          <div>
            {/* Header da Campanha */}
            <div style={{
              backgroundColor: '#1a2332',
              padding: '30px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              marginBottom: '24px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div>
                  <h2 style={{ 
                    margin: 0, 
                    color: '#ffffff',
                    fontSize: '28px',
                    fontWeight: '600'
                  }}>
                    {progress.campaignName || 'Campanha'}
                  </h2>
                  <div style={{
                    marginTop: '10px',
                    fontSize: '14px',
                    color: '#9e9e9e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    Status: 
                    <span style={{ 
                      color: getStatusColor(progress.status),
                      fontWeight: '600',
                      fontSize: '16px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(progress.status),
                        display: 'inline-block',
                        boxShadow: `0 0 10px ${getStatusColor(progress.status)}`
                      }}></span>
                      {getStatusText(progress.status)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {(progress.status === 'running' || progress.status === 'stopped') && (
                    <button
                      onClick={handleStop}
                      disabled={progress.status !== 'running'}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: progress.status === 'running' ? '#ff9800' : '#616161',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: progress.status === 'running' ? 'pointer' : 'not-allowed',
                        fontWeight: '600',
                        fontSize: '14px',
                        opacity: progress.status === 'running' ? 1 : 0.6,
                        transition: 'all 0.3s ease',
                        boxShadow: progress.status === 'running' ? '0 4px 12px rgba(255, 152, 0, 0.3)' : 'none'
                      }}
                      onMouseOver={(e) => {
                        if (progress.status === 'running') {
                          e.target.style.transform = 'translateY(-2px)'
                          e.target.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)'
                        }
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = progress.status === 'running' ? '0 4px 12px rgba(255, 152, 0, 0.3)' : 'none'
                      }}
                    >
                      ⏹️ Parar
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    disabled={progress.status === 'running'}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: progress.status === 'running' ? '#616161' : '#00bcd4',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: progress.status === 'running' ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: progress.status === 'running' ? 0.6 : 1,
                      transition: 'all 0.3s ease',
                      boxShadow: progress.status === 'running' ? 'none' : '0 4px 12px rgba(0, 188, 212, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      if (progress.status !== 'running') {
                        e.target.style.transform = 'translateY(-2px)'
                        e.target.style.boxShadow = '0 6px 16px rgba(0, 188, 212, 0.4)'
                      }
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = 'translateY(0)'
                      e.target.style.boxShadow = progress.status === 'running' ? 'none' : '0 4px 12px rgba(0, 188, 212, 0.3)'
                    }}
                  >
                    ✨ Nova Campanha
                  </button>
                </div>
              </div>

              {/* Estatísticas */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#0f1419',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid rgba(0, 188, 212, 0.3)',
                  boxShadow: '0 4px 12px rgba(0, 188, 212, 0.1)'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#00bcd4' }}>
                    {progress.sent} / {progress.total}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9e9e9e', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Enviados
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#0f1419',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid rgba(76, 175, 80, 0.3)',
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.1)'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#4caf50' }}>
                    {leadsEnviados}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9e9e9e', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Sucesso
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#0f1419',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid rgba(244, 67, 54, 0.3)',
                  boxShadow: '0 4px 12px rgba(244, 67, 54, 0.1)'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#f44336' }}>
                    {leadsErro}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9e9e9e', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Erros
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#0f1419',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid rgba(255, 152, 0, 0.3)',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: '#ff9800' }}>
                    {leadsPendentes}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9e9e9e', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Pendentes
                  </div>
                </div>
              </div>

              {/* Barra de Progresso */}
              {progress.total > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      color: '#b0b0b0',
                      fontWeight: '500'
                    }}>
                      Progresso
                    </div>
                    <div style={{
                      fontSize: '16px',
                      color: '#ffffff',
                      fontWeight: '600'
                    }}>
                      {percentage}%
                    </div>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '40px',
                    backgroundColor: '#0f1419',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    position: 'relative',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)'
                  }}>
                    <div style={{
                      width: `${percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #00bcd4 0%, #4caf50 100%)',
                      transition: 'width 0.5s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      boxShadow: '0 0 20px rgba(0, 188, 212, 0.5)'
                    }}>
                      {percentage > 8 && `${percentage}%`}
                    </div>
                  </div>
                </div>
              )}

              {/* Botões de Download */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
                <button
                  onClick={() => downloadPlanilha(true)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)'
                  }}
                  onMouseOut={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)'
                  }}
                >
                  📥 Baixar Planilha Completa
                </button>
                <button
                  onClick={() => downloadPlanilha(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)'
                  }}
                  onMouseOut={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.3)'
                  }}
                >
                  📥 Baixar Não Enviados
                </button>
              </div>
            </div>

            {/* Lista de Leads */}
            <div style={{
              backgroundColor: '#1a2332',
              padding: '30px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h3 style={{ 
                marginTop: 0, 
                marginBottom: '24px', 
                color: '#ffffff',
                fontSize: '22px',
                fontWeight: '600'
              }}>
                Leads ({progress.leads?.length || 0})
              </h3>
              <div style={{
                maxHeight: '600px',
                overflowY: 'auto',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                backgroundColor: '#0f1419'
              }}>
                {progress.leads && progress.leads.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{
                      backgroundColor: '#1a2332',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1
                    }}>
                      <tr>
                        <th style={{ 
                          padding: '16px', 
                          textAlign: 'left', 
                          borderBottom: '2px solid rgba(255,255,255,0.1)',
                          color: '#b0b0b0',
                          fontWeight: '600',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>
                          Nome
                        </th>
                        <th style={{ 
                          padding: '16px', 
                          textAlign: 'left', 
                          borderBottom: '2px solid rgba(255,255,255,0.1)',
                          color: '#b0b0b0',
                          fontWeight: '600',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>
                          Telefone
                        </th>
                        <th style={{ 
                          padding: '16px', 
                          textAlign: 'left', 
                          borderBottom: '2px solid rgba(255,255,255,0.1)',
                          color: '#b0b0b0',
                          fontWeight: '600',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '1px'
                        }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.leads.map((lead, index) => (
                        <tr key={index} style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          backgroundColor: lead.status === 'success' ? 'rgba(76, 175, 80, 0.05)' : 
                                         lead.status === 'error' ? 'rgba(244, 67, 54, 0.05)' : 
                                         lead.status === 'pending' ? 'rgba(255, 152, 0, 0.05)' : 
                                         'transparent',
                          transition: 'background-color 0.3s ease'
                        }}>
                          <td style={{ padding: '16px', color: '#e0e0e0', fontWeight: '500' }}>{lead.name}</td>
                          <td style={{ padding: '16px', color: '#b0b0b0', fontFamily: 'monospace' }}>{lead.phone}</td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '6px 16px',
                              borderRadius: '20px',
                              backgroundColor: getLeadStatusColor(lead.status),
                              color: 'white',
                              fontSize: '12px',
                              fontWeight: '600',
                              boxShadow: `0 2px 8px ${getLeadStatusColor(lead.status)}40`
                            }}>
                              {getLeadStatusText(lead.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ 
                    padding: '60px', 
                    textAlign: 'center', 
                    color: '#616161',
                    fontSize: '16px'
                  }}>
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
