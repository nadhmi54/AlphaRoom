import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiClient.js', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

const { apiFetch } = await import('./apiClient.js');
const ai = await import('./aiService.js');

describe('aiService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appelle les bonnes routes avec les bons paramètres', async () => {
    await ai.listAiSessions();
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/sessions');

    await ai.generateReports('s', 2);
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports/generate', { method: 'POST', body: { sessionId: 's', run: 2 } });
    await ai.generateReports('s', 2, 'p1');
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports/generate', { method: 'POST', body: { sessionId: 's', run: 2, participantId: 'p1' } });

    await ai.listReports('s', 1);
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports', { query: { sessionId: 's', run: 1 } });

    await ai.editReport('id', { summary: 'x' });
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports/id', { method: 'PATCH', body: { summary: 'x' } });

    await ai.validateReport('id', true);
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports/id/validate', { method: 'POST', body: { publish: true } });

    await ai.getAiUsage('s');
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/reports/usage', { query: { sessionId: 's' } });

    await ai.askCoach({ question: 'q' });
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/coach/ask', { method: 'POST', body: { question: 'q' } });

    await ai.analyzeMarket('s', 1);
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/analysis/market', { method: 'POST', body: { sessionId: 's', run: 1 } });

    await ai.analyzeReplay('s', 1, 2);
    expect(apiFetch).toHaveBeenLastCalledWith('/ai/analysis/replay', { method: 'POST', body: { sessionId: 's', fromRun: 1, toRun: 2 } });
  });
});
