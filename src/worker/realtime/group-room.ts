import { DurableObject } from 'cloudflare:workers';
import type { RealtimeEvent } from '../../shared/realtime';

type Attachment = { userId: string };

/**
 * グループ（家庭）ごとに1つ。メンバーの画面と WebSocket でつながり、
 * 献立や買い物リストの変更をまとめて配る。
 * Hibernation API を使うので、つながっているだけの間は Durable Object が眠り、費用がかからない。
 */
export class GroupRoom extends DurableObject<Env> {
  /** 画面からの接続（Worker が認証・メンバー確認をしてから転送してくる） */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const userId = request.headers.get('x-kondate-user');
    if (!userId) return new Response('unauthorized', { status: 401 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 生存確認（"ping" に "pong" を返す。眠ったままでも自動応答） */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // すでに閉じている
    }
  }

  /** 変更をメンバー全員に配る（Worker から RPC で呼ぶ） */
  async broadcast(event: RealtimeEvent): Promise<number> {
    const payload = JSON.stringify(event);
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
        sent++;
      } catch {
        // 切れた接続は無視
      }
    }
    return sent;
  }

  /** グループから抜けた人の接続を切る */
  async disconnect(userId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.close(4003, 'left group');
      } catch {
        // すでに閉じている
      }
    }
  }

  /** テスト・確認用：いまの接続数 */
  async connections(): Promise<number> {
    return this.ctx.getWebSockets().length;
  }
}
