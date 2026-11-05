import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(pbkdf2);
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

async function writeAtomically(file: string, contents: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await fsPromises.writeFile(tempFile, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fsPromises.rename(tempFile, file);
  } catch (error) {
    await fsPromises.rm(tempFile, { force: true });
    throw error;
  }
}

interface PasswordRecord {
  version: 1;
  salt: string;
  hash: string;
}

export class LocalPasswordAuth {
  private record: PasswordRecord | null;
  private updating = false;

  constructor(private readonly file: string, private readonly authorizationCodeFile: string) {
    this.record = this.readRecord();
  }

  get configured(): boolean {
    return this.record !== null;
  }

  async initializeAuthorizationCode(): Promise<void> {
    await fsPromises.mkdir(path.dirname(this.authorizationCodeFile), { recursive: true });
    const code = `JER-${randomBytes(24).toString('hex').toUpperCase()}\n`;
    try {
      await fsPromises.writeFile(this.authorizationCodeFile, code, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const savedCode = (await fsPromises.readFile(this.authorizationCodeFile, 'utf8')).trim();
    if (!/^JER-[A-F0-9]{48}$/.test(savedCode)) {
      throw new Error(`O arquivo de código de autorização está inválido: ${this.authorizationCodeFile}`);
    }
  }

  async setup(password: string): Promise<void> {
    if (this.record) throw new Error('A senha já foi configurada.');
    const record = await this.createPasswordRecord(password);

    await fsPromises.mkdir(path.dirname(this.file), { recursive: true });
    try {
      await fsPromises.writeFile(this.file, JSON.stringify(record), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('A senha já foi configurada.');
      throw error;
    }
    this.record = record;
  }

  async updatePassword(currentPassword: string, authorizationCode: string, newPassword: string): Promise<void> {
    if (this.updating) throw new Error('Já existe uma troca de senha em andamento.');
    this.updating = true;
    try {
      this.validatePassword(newPassword);
      if (!(await this.verify(currentPassword))) throw new Error('A senha atual está incorreta.');
      if (!(await this.verifyAuthorizationCode(authorizationCode))) throw new Error('O código de autorização está incorreto ou desatualizado.');
      const newRecord = await this.createPasswordRecord(newPassword);
      const previousCode = await fsPromises.readFile(this.authorizationCodeFile, 'utf8');
      const nextCode = `JER-${randomBytes(24).toString('hex').toUpperCase()}\n`;
      await writeAtomically(this.authorizationCodeFile, nextCode);
      try {
        await writeAtomically(this.file, JSON.stringify(newRecord));
      } catch (error) {
        try {
          await writeAtomically(this.authorizationCodeFile, previousCode);
        } catch (restoreError) {
          throw new Error(
            `Não foi possível salvar a nova senha nem restaurar o código de autorização: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
            { cause: error },
          );
        }
        throw error;
      }
      this.record = newRecord;
    } finally {
      this.updating = false;
    }
  }

  async verify(password: string): Promise<boolean> {
    if (!this.record || [...password].length > MAX_PASSWORD_LENGTH) return false;
    const actual = await deriveKey(password, Buffer.from(this.record.salt, 'hex'), ITERATIONS, KEY_LENGTH, 'sha256');
    return timingSafeEqual(actual, Buffer.from(this.record.hash, 'hex'));
  }

  private async createPasswordRecord(password: string): Promise<PasswordRecord> {
    this.validatePassword(password);
    const salt = randomBytes(16);
    const hash = await deriveKey(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
    return { version: 1, salt: salt.toString('hex'), hash: hash.toString('hex') };
  }

  private validatePassword(password: string): void {
    const length = [...password].length;
    if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH || !password.trim()) {
      throw new Error(`A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres e não pode ser apenas espaços.`);
    }
  }

  private async verifyAuthorizationCode(code: string): Promise<boolean> {
    if (code.length > 64) return false;
    const savedCode = (await fsPromises.readFile(this.authorizationCodeFile, 'utf8')).trim();
    const actual = Buffer.from(code.trim());
    const expected = Buffer.from(savedCode);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private readRecord(): PasswordRecord | null {
    let contents: string;
    try {
      contents = fs.readFileSync(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    let record: unknown;
    try {
      record = JSON.parse(contents);
    } catch {
      throw new Error(`O arquivo de autenticação está corrompido: ${this.file}`);
    }
    if (
      typeof record !== 'object' ||
      record === null ||
      !('version' in record) ||
      record.version !== 1 ||
      !('salt' in record) ||
      typeof record.salt !== 'string' ||
      !/^[a-f0-9]{32}$/.test(record.salt) ||
      !('hash' in record) ||
      typeof record.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.hash)
    ) {
      throw new Error(`O arquivo de autenticação tem um formato inválido: ${this.file}`);
    }
    return record as PasswordRecord;
  }
}
