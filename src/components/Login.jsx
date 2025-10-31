import { useState } from 'react'

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok) {
        onLogin(data.token)
      } else {
        setError(data.error || 'Erro ao fazer login')
      }
    } catch (err) {
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#0f1419',
      backgroundImage: 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)'
    }}>
      <div style={{
        backgroundColor: '#1a2332',
        padding: '50px',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        width: '100%',
        maxWidth: '450px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '40px'
        }}>
          <img 
            src="/fluxione-logo.png" 
            alt="Fluxione Logo" 
            style={{
              height: '60px',
              width: 'auto',
              marginBottom: '20px'
            }}
          />
          <h1 style={{
            margin: 0,
            color: '#ffffff',
            fontSize: '28px',
            fontWeight: '600'
          }}>
            Painel de Disparo
          </h1>
          <div style={{
            fontSize: '14px',
            color: '#9e9e9e',
            marginTop: '8px'
          }}>
            Sistema de Gestão de Campanhas
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '10px',
              color: '#b0b0b0',
              fontWeight: '500',
              fontSize: '14px'
            }}>
              Usuário
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '14px',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                backgroundColor: '#0f1419',
                color: '#ffffff',
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
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '14px',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                backgroundColor: '#0f1419',
                color: '#ffffff',
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
              border: '1px solid rgba(244, 67, 54, 0.3)',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#00bcd4',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(0, 188, 212, 0.3)'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 6px 16px rgba(0, 188, 212, 0.4)'
              }
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 4px 12px rgba(0, 188, 212, 0.3)'
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
