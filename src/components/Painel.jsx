import { useState, useEffect, useRef } from 'react'

const Painel = ({ token, onLogout }) => {
  const [campaignName, setCampaignName] = useState('')
  const [leadsText, setLeadsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [progress, setProgress] = useState({
    total: 0,
    sent: 0,
    campaignName: '',
    status: 'idle',
    leads: [],
    tempoParaEnvio: null,
    timestampRecebido: null
  })

  const eventSourceRef = useRef(null)
  const countdownIntervalRef = useRef(null)
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

  // Countdown timer
  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }

    if (progress.tempoParaEnvio && progress.timestampRecebido && progress.status === 'running') {
      const updateCountdown = () => {
        const elapsed = Math.floor((Date.now() - progress.timestampRecebido) / 1000)
        const remaining = progress.tempoParaEnvio - elapsed

        if (remaining <= 0) {
          setCountdown(null)
        } else {
          setCountdown(remaining)
        }
      }

      updateCountdown()
      countdownIntervalRef.current = setInterval(updateCountdown, 1000)
    } else {
      setCountdown(null)
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [progress.tempoParaEnvio, progress.timestampRecebido, progress.status])

  const formatCountdown = (seconds) => {
    if (!seconds || seconds <= 0) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

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

  const getStatusBadge = (status) => {
    const styles = {
      idle: { bg: '#374151', text: '#9ca3af', label: 'Aguardando' },
      running: { bg: '#1e40af', text: '#93c5fd', label: 'Em Execução' },
      stopped: { bg: '#ea580c', text: '#fdba74', label: 'Parado' },
      done: { bg: '#059669', text: '#6ee7b7', label: 'Concluído' }
    }
    const style = styles[status] || styles.idle
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '6px',
        backgroundColor: style.bg,
        color: style.text,
        fontSize: '13px',
        fontWeight: '500'
      }}>
        {style.label}
      </span>
    )
  }

  const getLeadStatusBadge = (status) => {
    const styles = {
      success: { bg: '#059669', text: '#fff', label: 'Enviado' },
      error: { bg: '#dc2626', text: '#fff', label: 'Erro' },
      pending: { bg: '#ea580c', text: '#fff', label: 'Pendente' },
      not_sent: { bg: '#6b7280', text: '#fff', label: 'Não Enviado' }
    }
    const style = styles[status] || styles.pending
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '4px',
        backgroundColor: style.bg,
        color: style.text,
        fontSize: '12px',
        fontWeight: '500'
      }}>
        {style.label}
      </span>
    )
  }

  const percentage = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0
  const leadsEnviados = progress.leads?.filter(l => l.status === 'success').length || 0
  const leadsErro = progress.leads?.filter(l => l.status === 'error').length || 0
  const leadsPendentes = progress.leads?.filter(l => l.status === 'pending' || l.status === 'not_sent').length || 0
  const showLeadsView = progress.status !== 'idle' && progress.leads && progress.leads.length > 0

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src="/fluxione-logo.png" alt="Logo" style={{ height: '40px' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: '#f1f5f9' }}>
                Painel de Disparo
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
                Sistema de Gestão de Campanhas
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Sair
          </button>
        </div>

        {!showLeadsView ? (
          /* Formulário */
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '32px'
          }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600', color: '#f1f5f9' }}>
              Nova Campanha
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#cbd5e1' }}>
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
                  padding: '10px 14px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#cbd5e1' }}>
                Leads (nome,telefone)
              </label>
              <textarea
                value={leadsText}
                onChange={(e) => setLeadsText(e.target.value)}
                placeholder="João,5511999999999&#10;Maria,5511933334444"
                rows={12}
                disabled={isSending}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            {error && (
              <div style={{
                marginBottom: '20px',
                padding: '12px',
                backgroundColor: '#7f1d1d',
                border: '1px solid #991b1b',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleIniciarDisparo}
              disabled={loading || isSending}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#1e40af',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (loading || isSending) ? 'not-allowed' : 'pointer',
                opacity: (loading || isSending) ? 0.5 : 1
              }}
            >
              {loading ? 'Iniciando...' : isSending ? 'Aguardando...' : 'Iniciar Disparo'}
            </button>
          </div>
        ) : (
          /* Acompanhamento */
          <div>
            {/* Header da Campanha */}
            <div style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px',
              marginBottom: '24px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '24px'
              }}>
                <div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '600', color: '#f1f5f9' }}>
                    {progress.campaignName}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {getStatusBadge(progress.status)}
                    {countdown && progress.status === 'running' && (
                      <span style={{
                        fontSize: '13px',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                        padding: '4px 12px',
                        backgroundColor: '#0f172a',
                        borderRadius: '6px',
                        border: '1px solid #334155'
                      }}>
                        Enviando em: {formatCountdown(countdown)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(progress.status === 'running' || progress.status === 'stopped') && (
                    <button
                      onClick={handleStop}
                      disabled={progress.status !== 'running'}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: progress.status === 'running' ? '#ea580c' : '#374151',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: progress.status === 'running' ? 'pointer' : 'not-allowed',
                        opacity: progress.status === 'running' ? 1 : 0.5
                      }}
                    >
                      Parar
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    disabled={progress.status === 'running'}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: progress.status === 'running' ? '#374151' : '#1e40af',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: progress.status === 'running' ? 'not-allowed' : 'pointer',
                      opacity: progress.status === 'running' ? 0.5 : 1
                    }}
                  >
                    Nova Campanha
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
                marginBottom: '20px'
              }}>
                {[
                  { label: 'Total', value: `${progress.sent}/${progress.total}`, color: '#64748b' },
                  { label: 'Sucesso', value: leadsEnviados, color: '#059669' },
                  { label: 'Erros', value: leadsErro, color: '#dc2626' },
                  { label: 'Pendentes', value: leadsPendentes, color: '#ea580c' }
                ].map((stat, idx) => (
                  <div key={idx} style={{
                    padding: '16px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px'
                  }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: stat.color, marginBottom: '4px' }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              {progress.total > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>Progresso</span>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '600' }}>{percentage}%</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#0f172a',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${percentage}%`,
                      height: '100%',
                      backgroundColor: '#1e40af',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}

              {/* Download Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => downloadPlanilha(true)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#0f172a',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Baixar Todos
                </button>
                <button
                  onClick={() => downloadPlanilha(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#0f172a',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Baixar Não Enviados
                </button>
              </div>
            </div>

            {/* Lista de Leads */}
            <div style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '20px', borderBottom: '1px solid #334155' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#f1f5f9' }}>
                  Leads ({progress.leads?.length || 0})
                </h3>
              </div>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {progress.leads && progress.leads.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome</th>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefone</th>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.leads.map((lead, idx) => (
                        <tr key={idx} style={{ borderTop: '1px solid #334155' }}>
                          <td style={{ padding: '12px 20px', fontSize: '14px', color: '#cbd5e1' }}>{lead.name}</td>
                          <td style={{ padding: '12px 20px', fontSize: '14px', color: '#94a3b8', fontFamily: 'monospace' }}>{lead.phone}</td>
                          <td style={{ padding: '12px 20px' }}>{getLeadStatusBadge(lead.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
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
