import { ApiError, body, db, json } from './server';
import { normalizeTerminal } from './starlink';

export async function starlinkConnection(request: Request, accountId: string) {
  switch (request.method) {
    case 'GET': {
      const dish = await db().prepare('SELECT name,terminal_id AS terminalId FROM starlink_dishes WHERE account_id=?')
        .bind(accountId).first<{ name: string; terminalId: string }>();
      return json({ dish });
    }
    case 'PUT': {
      const data = await body(request);
      const name = typeof data?.name === 'string' ? data.name.trim() : '';
      const terminalId = normalizeTerminal(data?.terminalId);
      if (!name || name.length > 80 || !terminalId) {
        throw new ApiError('Enter a dish name and the Terminal ID from the Starlink app.');
      }
      await db().prepare(`INSERT INTO starlink_dishes(account_id,name,terminal_id) VALUES(?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,terminal_id=excluded.terminal_id`)
        .bind(accountId, name, terminalId).run();
      return json({ dish: { name, terminalId } });
    }
    case 'DELETE':
      await db().prepare('DELETE FROM starlink_dishes WHERE account_id=?').bind(accountId).run();
      return json({ dish: null });
    default:
      throw new ApiError('Method not allowed.', 405);
  }
}
