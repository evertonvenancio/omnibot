import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const Database = require('better-sqlite3')('data/sqlite.db', { readonly: true });

    const campaign = Database.prepare(
      `SELECT ai_template, start_hour, end_hour, min_contacts, max_contacts, days_of_week, humanization_profile
       FROM wa_campaigns
       WHERE status = 'saved'
       ORDER BY id DESC LIMIT 1`
    ).get() as any;

    Database.close();

    if (campaign) {
      return NextResponse.json({
        success: true,
        data: campaign
      });
    } else {
      return NextResponse.json({
        success: false,
        data: null
      });
    }
  } catch (error: any) {
    console.error('[WA API] Erro ao carregar campanha:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Erro ao carregar campanha'
    }, { status: 500 });
  }
}
