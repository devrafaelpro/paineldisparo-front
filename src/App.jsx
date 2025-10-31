import { useState, useEffect } from 'react'
import Login from './components/Login'
import Painel from './components/Painel'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)

  useEffect(() => {
    // Verifica se já existe token salvo
    const savedToken = localStorage.getItem('token')
    if (savedToken) {
      setToken(savedToken)
      setIsAuthenticated(true)
    }
  }, [])

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setIsAuthenticated(false)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1419' }}>
      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Painel token={token} onLogout={handleLogout} />
      )}
    </div>
  )
}

export default App

