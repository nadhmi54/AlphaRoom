import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [status, setStatus] = useState('checking...');

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main>
      <h1>AlphaRoom</h1>
      <p>Simulateur de Salle de Marche</p>
      <p data-testid="backend-status">Backend status: {status}</p>
    </main>
  );
}
