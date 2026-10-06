import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o caminho atual do arquivo (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCK_FILE = path.join(__dirname, 'worker.lock');

interface LockInfo {
  pid: number;
  timestamp: number;
}

export class ProcessLock {
  private pid: number;

  constructor() {
    this.pid = process.pid;
  }

  /**
   * Verifica se já existe um worker rodando
   * @returns {LockInfo | null} Informações do lock existente ou null se não houver lock
   */
  static checkExisting(): LockInfo | null {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const lockData = fs.readFileSync(LOCK_FILE, 'utf8');
        const lock: LockInfo = JSON.parse(lockData);

        // Verificar se o processo ainda está rodando
        try {
      process.kill(lock.pid, 0);
      return lock; // Processo ainda está rodando
    } catch (err) {
      // Processo não está mais rodando, remove o lock inválido
      ProcessLock.removeLock();
      return null;
    }
      }
      return null;
    } catch (err) {
      console.error('[LOCK] Erro ao verificar lock existente:', err);
      return null;
    }
  }

  /**
   * Cria um lock de processo
   * @returns {boolean} True se o lock foi criado com sucesso, false se já existir um lock
   */
  acquire(): boolean {
    const existingLock = ProcessLock.checkExisting();
    if (existingLock) {
      console.error(`❌ [LOCK] Já existe um worker rodando com PID ${existingLock.pid} — abortando`);
      return false;
    }

    try {
      const lock: LockInfo = {
        pid: this.pid,
        timestamp: Date.now()
      };
      fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
      console.log(`✅ [LOCK] Lock criado com PID ${this.pid}`);
      return true;
    } catch (err) {
      console.error(`❌ [LOCK] Erro ao criar lock:`, err);
      return false;
    }
  }

  /**
   * Remove o lock do processo atual
   */
  release(): void {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const lockData = fs.readFileSync(LOCK_FILE, 'utf8');
        const lock: LockInfo = JSON.parse(lockData);

        // Remove apenas se for o mesmo PID
        if (lock.pid === this.pid) {
          fs.unlinkSync(LOCK_FILE);
          console.log(`✅ [LOCK] Lock removido com PID ${this.pid}`);
        }
      }
    } catch (err) {
      console.error(`❌ [LOCK] Erro ao remover lock:`, err);
    }
  }

  /**
   * Remove lock inválido (opcional, para limpeza)
   */
  static removeLock(): void {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
        console.log(`✅ [LOCK] Lock inválido removido`);
      }
    } catch (err) {
      console.error(`❌ [LOCK] Erro ao remover lock inválido:`, err);
    }
  }
}

// Exportar uma função utilitária para verificar e lidar com lock
export function ensureSingleInstance(): boolean {
  const lock = new ProcessLock();

  // Verificar se já existe um lock
  if (!lock.acquire()) {
    process.exit(1);
  }

  // Configurar handlers para remover o lock ao encerrar
  const removeLockHandler = () => {
    lock.release();
    process.exit(0);
  };

  process.on('SIGINT', removeLockHandler);
  process.on('SIGTERM', removeLockHandler);
  process.on('exit', () => {
    lock.release();
  });

  return true;
}