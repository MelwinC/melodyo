import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./index.js', () => ({ start: vi.fn() }));

afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

describe('main', () => {
  it('démarre le serveur', async () => {
    const { start } = await import('./index.js');
    start.mockResolvedValue({});
    await import('./main.js');
    expect(start).toHaveBeenCalledOnce();
  });

  it('quitte avec le code 1 si le démarrage échoue', async () => {
    const { start } = await import('./index.js');
    start.mockRejectedValue(new Error('Base de données injoignable : refus'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    await import('./main.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(error).toHaveBeenCalledWith('Base de données injoignable : refus');
  });
});
