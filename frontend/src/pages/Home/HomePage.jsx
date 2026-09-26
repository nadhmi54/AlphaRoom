import { useEffect, useState } from 'react';
import Header from '../../components/Header/Header.jsx';
import { fetchHealthStatus } from '../../services/healthService.js';

export default function HomePage() {
  const [status, setStatus] = useState('checking...');

  useEffect(() => {
    fetchHealthStatus().then(setStatus);
  }, []);

  return (
    <>
      <Header />
      <p
        data-testid="backend-status"
        style={{ padding: '24px 100px', margin: 0, color: '#6b7280', fontSize: '13px', background: '#04050a' }}
      >
        Backend status: {status}
      </p>
    </>
  );
}
