import Database from 'better-sqlite3';

const dbPath = 'data/sqlite.db';

export interface ExperimentWithVariants {
  id: number;
  name: string;
  status: string;
  variants: Variant[];
}

export interface Variant {
  id: number;
  content: string;
  isControl: boolean;
  isWinner: boolean;
}

/**
 * Seleciona uma variante para o lead.
 * Regras do motor de experimentos:
 * - Se houver uma variante com is_winner = true, usa ela.
 * - Se não, sorteia 50% controle / 50% teste entre as variantes disponíveis.
 */
export function selectVariantForLead(experimentName: string): Variant | null {
  const db = new Database(dbPath);
  try {
    // Encontra o experimento ativo
    const exp = db.prepare("SELECT * FROM experiments WHERE name = ? AND status = 'running'").get(experimentName) as any;
    if (!exp) return null;

    const variants = db.prepare("SELECT * FROM variants WHERE experiment_id = ?").all(exp.id) as any[];

    // Verifica se já existe uma vencedora
    const winner = variants.find((v) => v.is_winner);
    if (winner) {
      return { id: winner.id, content: winner.content, isControl: !!winner.is_control, isWinner: true };
    }

    // Sorteio 50/50
    if (variants.length === 0) return null;
    const control = variants.find((v) => v.is_control);
    const testVariants = variants.filter((v) => !v.is_control);

    const isTest = Math.random() < 0.5;
    if (isTest && testVariants.length > 0) {
      const chosen = testVariants[Math.floor(Math.random() * testVariants.length)];
      return { id: chosen.id, content: chosen.content, isControl: false, isWinner: false };
    } else if (control) {
      return { id: control.id, content: control.content, isControl: true, isWinner: false };
    }
    return null;
  } finally {
    db.close();
  }
}

/**
 * Cria o experimento e variantes iniciais se não existirem.
 */
export function ensureExperiment(experimentName: string, controlContent: string, testContent: string) {
  const db = new Database(dbPath);
  try {
    let exp = db.prepare("SELECT * FROM experiments WHERE name = ?").get(experimentName) as any;

    const insertExp = db.prepare("INSERT INTO experiments (name, status) VALUES (?, 'running')");
    const insertVar = db.prepare("INSERT INTO variants (experiment_id, content, is_control) VALUES (?, ?, ?)");

    if (!exp) {
      const tx = db.transaction(() => {
        const res = insertExp.run(experimentName);
        const expId = Number(res.lastInsertRowid);
        insertVar.run(expId, controlContent, 1); // Controle
        insertVar.run(expId, testContent, 0);    // Teste B
      });
      tx();
      console.log(`🧪 [EXPERIMENT] Experimento '${experimentName}' criado com 2 variantes.`);
    }
  } finally {
    db.close();
  }
}

/**
 * Registra uma resposta recebida para uma variante e avalia se ela deve ser declarada vencedora.
 * Aplica regra simples: após 20 amostras, se a taxa de resposta da teste for 50% maior que a controle, marca como vencedora.
 */
export function recordVariantResponse(variantId: number) {
  const db = new Database(dbPath);
  try {
    db.prepare("UPDATE variants SET response_count = response_count + 1 WHERE id = ?").run(variantId);

    const variant = db.prepare("SELECT * FROM variants WHERE id = ?").get(variantId) as any;
    const exp = db.prepare("SELECT * FROM experiments WHERE id = ?").get(variant.experiment_id) as any;

    const allVariants = db.prepare("SELECT * FROM variants WHERE experiment_id = ?").all(variant.experiment_id) as any[];

    // Incrementa o sample size global do experimento (aproximação)
    // Para o MVP, usamos response_count como proxy de sample_size
    const totalSamples = allVariants.reduce((acc, v) => acc + (v.response_count || 0), 0);

    if (totalSamples >= 20 && exp.status === 'running') {
      const control = allVariants.find((v) => v.is_control);
      const test = allVariants.find((v) => !v.is_control);

      if (control && test) {
        const controlRate = control.sample_size > 0 ? control.response_count / control.sample_size : 0;
        const testRate = test.sample_size > 0 ? test.response_count / test.sample_size : 0;

        if (testRate > controlRate * 1.5 && testRate > 0) {
          console.log(`🏆 [EXPERIMENT] Variante #${test.id} declarada vencedora!`);
          const tx = db.transaction(() => {
            db.prepare("UPDATE variants SET is_winner = 1 WHERE id = ?").run(test.id);
            db.prepare("UPDATE experiments SET status = 'completed' WHERE id = ?").run(exp.id);
          });
          tx();
        }
      }
    }
  } finally {
    db.close();
  }
}

/**
 * Registra uma proposta de novo prompt vinda da IA para revisão humana.
 * A IA NÃO pode criar prompts ativos diretamente. Apenas sugerir.
 */
export function registerAiProposal(reason: string, proposedContent: string) {
  const db = new Database(dbPath);
  try {
    db.prepare("INSERT INTO ai_proposals (reason, proposed_content) VALUES (?, ?)").run(reason, proposedContent);
    console.log(`💡 [AI PROPOSAL] Nova sugestão registrada para revisão humana.`);
  } finally {
    db.close();
  }
}
