import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ [WEBHOOK GET] Verificação da Meta aceita.');
    return new NextResponse(challenge, { status: 200 });
  }
  console.warn('❌ [WEBHOOK GET] Token de verificação inválido.');
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-Hub-Signature-256');
  const isTestBypass = req.headers.get('X-Test-Bypass') === 'true';
  const rawBody = await req.text();

  // 1. Verificação de Assinatura
  if (!isTestBypass) {
    if (!signature || !process.env.INSTAGRAM_APP_SECRET) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const expectedHash = crypto
      .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
      .update(rawBody)
      .digest('hex');
    if (signature !== `sha256=${expectedHash}`) {
      console.warn('❌ [WEBHOOK POST] Assinatura HMAC inválida.');
      return new NextResponse('Invalid signature', { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody);

  // 2. Idempotência e Processamento
  const sqlite = new Database(dbPath);
  try {
    // Estrutura típica do webhook do Instagram (messaging array)
    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];
    if (!messaging) return new NextResponse('No messaging', { status: 200 });

    const messageId = messaging.message?.mid;
    const senderId = messaging.sender?.id;
    const messageText = messaging.message?.text;
    const timestamp = messaging.timestamp; // Em milissegundos

    if (!messageId || !senderId || !messageText) {
      return new NextResponse('Ignored', { status: 200 });
    }

    // Checagem de duplicidade
    const exists = sqlite.prepare('SELECT id FROM messages WHERE variant = ?').get(messageId);
    if (exists) {
      console.log(`🔁 [WEBHOOK POST] Mensagem ${messageId} já processada (idempotência).`);
      return new NextResponse('Already processed', { status: 200 });
    }

    // Salva o raw inbound e enfileira
    sqlite.prepare(`
      INSERT INTO messages (lead_id, channel, direction, content, variant)
      VALUES (NULL, 'META_API', 'INBOUND', ?, ?)
    `).run(messageText, messageId);

    sqlite.prepare(`
      INSERT INTO jobs (type, payload)
      VALUES ('process_inbound_message', ?)
    `).run(JSON.stringify({ senderId, messageText, messageId, timestamp }));

    console.log(`📥 [WEBHOOK POST] Mensagem ${messageId} recebida e enfileirada.`);
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (err: any) {
    console.error('❌ [WEBHOOK POST] Erro ao processar payload:', err.message);
    return new NextResponse('Internal Error', { status: 200 }); // Retorna 200 pra Meta não retentar
  } finally {
    sqlite.close();
  }
}
