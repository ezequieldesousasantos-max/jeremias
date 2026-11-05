import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateExpression, isValidCpf, isValidCnpj, mathTool, timeTool, unitTool, validateTool,
  parseFileQuery, searchFiles, systemTool, parseOpenQuery, openOrReadTool, parseCreateRequest, createTool, validateNewFile, writeNewFile, resolveInsideRoots, routeLocal, needsWeb, hashTool, fileSearchTool,
} from './localTools.ts';

const FIXED = new Date('2026-10-30T14:32:00-03:00');
const TZ = 'America/Sao_Paulo';

test('hora e data', () => {
  assert.match(timeTool('que horas são?', { now: FIXED, timeZone: TZ })!.text, /14:32/);
  assert.match(timeTool('Que dia é hoje?', { now: FIXED, timeZone: TZ })!.text, /sexta-feira, 30 de outubro de 2026/);
  assert.match(timeTool('quantos dias faltam para 25/12/2026', { now: FIXED, timeZone: TZ })!.text, /Faltam 56 dia/);
  assert.match(timeTool('quantos dias faltam para 31/02/2026', { now: FIXED, timeZone: TZ })!.text, /não é uma data válida/);
  assert.equal(timeTool('conte uma história', { now: FIXED }), null);
});

test('parser de expressões: precedência, potência, funções', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
  assert.equal(evaluateExpression('2^3^2'), 512);
  assert.equal(evaluateExpression('-2^2'), -4);
  assert.equal(evaluateExpression('sqrt(144)+abs(-3)'), 15);
  assert.equal(evaluateExpression('10/4'), 2.5);
  assert.throws(() => evaluateExpression('1/0'), /zero/);
  assert.throws(() => evaluateExpression('2+'));
  assert.throws(() => evaluateExpression('process'));
  assert.throws(() => evaluateExpression('((((((((((((((((((((((((((((((((((((((((((((((((((((1))))))))))))))))))))))))))))))))))))))))))))))))))))'));
});

test('contas em português', () => {
  assert.match(mathTool('quanto é 15% de 230?')!.text, /34,5/);
  assert.match(mathTool('quanto é 2+2')!.text, /= 4$/);
  assert.match(mathTool('calcule 1.500 mais 2.500')!.text, /= 4\.000$/);
  assert.match(mathTool('10 dividido por 4')!.text, /= 2,5$/);
  assert.match(mathTool('3,5 vezes 2')!.text, /= 7$/);
  assert.match(mathTool('raiz quadrada de 81')!.text, /= 9$/);
  assert.match(mathTool('5 / 0')!.text, /zero/i);
  // não confunde conversa com conta
  assert.equal(mathTool('me explique o que é HTML'), null);
  assert.equal(mathTool('2026'), null);
  assert.equal(mathTool('estou em 2026 e quero aprender css'), null);
  assert.equal(mathTool('require("fs")+1'), null);
});

test('conversão de unidades', () => {
  assert.match(unitTool('converta 10 km para milhas')!.text, /6,2137/);
  assert.match(unitTool('100 celsius em fahrenheit')!.text, /212/);
  assert.match(unitTool('1 gb para mb')!.text, /1\.024/);
  assert.match(unitTool('5 kg para metros')!.text, /Não dá para converter/);
  assert.equal(unitTool('vou para casa em 5 minutos'), null);
});

test('CPF e CNPJ', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-80'), false);
  assert.match(validateTool('validar cpf 529.982.247-25')!.text, /corretos/);
  assert.match(validateTool('o cpf 123.456.789-00 é válido?')!.text, /INVÁLIDO/);
  assert.match(validateTool('verifique o e-mail ezequiel@exemplo.com.br')!.text, /formato válido/);
  assert.match(validateTool('verifique o email foo@bar')!.text, /INVÁLIDO/);
  assert.match(validateTool('29/02/2025 é uma data válida?')!.text, /INVÁLIDA/);
  assert.match(validateTool('29/02/2028 é uma data válida?')!.text, /válida/);
  assert.equal(validateTool('meu cpf é 529.982.247-25'), null); // sem pedido de verificação
});

test('busca de arquivos e limites de pasta', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-'));
  const docs = path.join(base, 'docs');
  const outside = path.join(base, 'fora');
  fs.mkdirSync(path.join(docs, 'sub', 'node_modules'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(docs, 'Relatório Final.pdf'), 'a');
  fs.writeFileSync(path.join(docs, 'TCC.docx'), 'documento');
  fs.writeFileSync(path.join(docs, 'sub', 'relatorio-2025.txt'), 'bb');
  fs.writeFileSync(path.join(docs, 'sub', 'node_modules', 'relatorio.pdf'), 'x');
  fs.writeFileSync(path.join(outside, 'segredo.txt'), 'senha');
  try { fs.symlinkSync(outside, path.join(docs, 'atalho')); } catch { /* sem permissão para symlink */ }

  assert.deepEqual(parseFileQuery('encontre o arquivo relatorio pdf'), { terms: ['relatorio'], exts: ['.pdf'] });
  assert.deepEqual(parseFileQuery('procure o arquivo "Relatório Final"')?.terms, ['relatorio final']);
  assert.deepEqual(parseFileQuery('TCC.docx'), { terms: ['tcc.docx'], exts: [] });
  assert.match((await fileSearchTool('TCC.docx', { roots: [docs] }))!.text, /TCC\.docx/);
  assert.equal(parseFileQuery('me conte uma piada'), null);

  const r = await searchFiles(['relatorio'], [], [docs]);
  assert.equal(r.files.length, 2); // ignora node_modules
  const pdf = await searchFiles(['relatorio'], ['.pdf'], [docs]);
  assert.equal(pdf.files.length, 1);
  const seg = await searchFiles(['segredo'], [], [docs]);
  assert.equal(seg.files.length, 0); // não segue atalho para fora

  const out = await fileSearchTool('encontre o arquivo relatorio', { roots: [docs] });
  assert.match(out!.text, /2 arquivo/);
  assert.equal(out!.touchesFiles, true);

  // hash só dentro das pastas autorizadas
  const ok = await hashTool(`hash sha256 de "${path.join(docs, 'sub', 'relatorio-2025.txt')}"`, { roots: [docs] });
  assert.match(ok!.text, /[0-9a-f]{64}/);
  const no = await hashTool(`hash de "${path.join(outside, 'segredo.txt')}"`, { roots: [docs] });
  assert.match(no!.text, /fora das pastas autorizadas/);
  const trav = await hashTool(`hash de "${path.join(docs, '..', 'fora', 'segredo.txt')}"`, { roots: [docs] });
  assert.match(trav!.text, /fora das pastas autorizadas/);
  assert.equal(resolveInsideRoots('/etc/passwd', [docs]), null);

  fs.rmSync(base, { recursive: true, force: true });
});

test('roteador: local primeiro, nuvem só para o que precisa', async () => {
  assert.equal((await routeLocal('quanto é 7*6', { now: FIXED }))!.tool, 'calculo');
  assert.equal((await routeLocal('que horas são', { now: FIXED }))!.tool, 'hora');
  assert.equal(await routeLocal('explique o que é flexbox'), null);
  assert.equal(needsWeb('pesquise as últimas notícias sobre IA'), true);
  assert.equal(needsWeb('qual a cotação do dólar'), true);
  assert.equal(needsWeb('explique o que é flexbox'), false);
  assert.equal(needsWeb('que horas são'), false);
});

test('estado do computador (multiplataforma)', async () => {
  assert.match((await systemTool('quanta memória livre eu tenho?'))!.text, /Memória RAM: .* livres de/);
  assert.match((await systemTool('quanto espaço livre no disco?'))!.text, /Disco \(.*\): .* livres de/);
  assert.match((await systemTool('que sistema operacional eu uso'))!.text, /Sistema: /);
  const hardware = await systemTool('demonstre os componentes do computador');
  assert.match(hardware!.text, /Processador: /);
  assert.match(hardware!.text, /Memória RAM: /);
  assert.match(hardware!.text, /Disco \(/);
  assert.match(hardware!.text, /Interfaces de rede ativas: /);
  assert.match(hardware!.text, /GPU e placa-mãe: não disponíveis/);

  let probes = 0;
  const online = await systemTool('verifique como está a conexão com a internet', {
    checkInternet: async () => { probes++; return { status: 204 }; },
  });
  assert.equal(probes, 1);
  assert.match(online!.text, /Internet: conexão externa confirmada/);
  assert.match(online!.text, /não envia mensagens, arquivos ou histórico/);
  const fullDiagnostic = await systemTool('demonstre os componentes do computador e como ele está interagindo com a internet', {
    checkInternet: async () => ({ status: 204 }),
  });
  assert.match(fullDiagnostic!.text, /Processador: /);
  assert.match(fullDiagnostic!.text, /Internet: conexão externa confirmada/);
  assert.equal((await systemTool('teste a conexão com a internet', {
    checkInternet: async () => { throw new Error('offline'); },
  }))?.text.includes('Internet: não foi possível alcançar'), true);

  assert.equal(await systemTool('explique o que é memória RAM'), null);
  assert.equal(await systemTool('quanto é 2+2'), null);
  assert.equal((await routeLocal('quanta memória ram livre?'))!.tool, 'sistema');
  assert.equal((await routeLocal('demonstre os componentes do computador'))!.tool, 'sistema');
});

test('ler e abrir arquivos: só dentro das pastas, sem segredos e sem executáveis', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-open-'));
  const docs = path.join(base, 'docs');
  const outside = path.join(base, 'fora');
  fs.mkdirSync(docs); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(docs, 'notas.txt'), 'comprar pão\nestudar css');
  fs.writeFileSync(path.join(docs, 'ficha.pdf'), '%PDF-1.4 fake');
  fs.writeFileSync(path.join(docs, 'foto.bin'), Buffer.from([1, 2, 0, 3, 4]));
  fs.writeFileSync(path.join(docs, '.env'), 'GEMINI_API_KEY=segredo');
  fs.writeFileSync(path.join(docs, 'programa.exe'), 'MZ');
  fs.writeFileSync(path.join(docs, 'relatorio-a.txt'), 'a');
  fs.writeFileSync(path.join(docs, 'relatorio-b.txt'), 'b');
  fs.writeFileSync(path.join(outside, 'segredo.txt'), 'senha123');
  const opened: string[] = [];
  const opts = { roots: [docs], opener: async (f: string) => { opened.push(f); } };

  assert.equal(parseOpenQuery('leia o arquivo notas.txt')?.mode, 'read');
  assert.equal(parseOpenQuery('abra o arquivo ficha.pdf')?.mode, 'open');
  assert.equal(parseOpenQuery('abra https://google.com'), null);
  assert.equal(parseOpenQuery('quero abrir uma conta no banco'), null);
  assert.equal(parseOpenQuery('procure o arquivo notas'), null); // busca vence

  const lido = await openOrReadTool('leia o arquivo notas.txt', opts);
  assert.match(lido!.text, /comprar pão\nestudar css/);
  assert.equal(lido!.touchesFiles, true);

  const aberto = await openOrReadTool('abra o arquivo ficha.pdf', opts);
  assert.match(aberto!.text, /Abri "ficha.pdf"/);
  assert.equal(opened.length, 1);

  assert.match((await openOrReadTool('abra o arquivo programa.exe', opts))!.text, /Não abro/);
  assert.match((await openOrReadTool('leia o arquivo .env', opts))!.text, /segredos/);
  assert.match((await openOrReadTool('leia o arquivo foto.bin', opts))!.text, /binário/);
  assert.match((await openOrReadTool('leia o arquivo relatorio', opts))!.text, /2 arquivos parecidos/);
  assert.match((await openOrReadTool('leia o arquivo inexistente.txt', opts))!.text, /Não achei/);
  assert.match((await openOrReadTool(`leia o arquivo "${path.join(outside, 'segredo.txt')}"`, opts))!.text, /fora das pastas/);
  assert.match((await openOrReadTool(`leia o arquivo "${path.join(docs, '..', 'fora', 'segredo.txt')}"`, opts))!.text, /fora das pastas/);
  assert.equal(opened.length, 1); // nenhum bloqueado chegou a abrir

  fs.rmSync(base, { recursive: true, force: true });
});

test('criar arquivos: interpretação do pedido e validações', async () => {
  const NOW = new Date(2026, 9, 31, 8, 5);
  assert.deepEqual(parseCreateRequest('crie o arquivo notas.txt com o texto Comprar pão', NOW), { name: 'notas.txt', content: 'Comprar pão' });
  assert.deepEqual(parseCreateRequest('Crie um arquivo chamado lista.md contendo: # Estudos\\n- css', NOW), { name: 'lista.md', content: '# Estudos\n- css' });
  assert.deepEqual(parseCreateRequest('crie um arquivo "minhas notas.txt" com o conteúdo "olá"', NOW), { name: 'minhas notas.txt', content: 'olá' });
  assert.deepEqual(parseCreateRequest('crie um arquivo vazio vazio.txt', NOW), { name: 'vazio.txt', content: '' });
  assert.deepEqual(parseCreateRequest('crie um arquivo com o texto oi', NOW), { name: 'jeremias-20261031-0805.txt', content: 'oi' });
  // na dúvida, não cria: segue para o modelo
  assert.equal(parseCreateRequest('crie um arquivo html com um formulário de login', NOW), null);
  assert.equal(parseCreateRequest('como criar um arquivo html?', NOW), null);
  assert.equal(parseCreateRequest('crie um arquivo', NOW), null);
  assert.equal(parseCreateRequest('leia o arquivo notas.txt', NOW), null);

  // pedido válido gera pendência (nada é gravado pela ferramenta)
  assert.deepEqual(createTool('crie o arquivo a.txt com o texto x')!.pendingWrite, { name: 'a.txt', content: 'x' });
  // validações
  assert.equal(validateNewFile('ok.html', '<p>oi</p>').ok, true);
  for (const bad of ['../x.txt', 'a/b.txt', 'a\\b.txt', 'c:x.txt', '.env', 'x.exe', 'x.bat', 'x.ps1', 'x.js', 'x.vbs', 'sem-extensao', 'con.txt', 'nul.txt', 'x.txt.', 'a..b.txt']) {
    assert.equal(validateNewFile(bad, 'x').ok, false, bad);
  }
  assert.equal(validateNewFile('grande.txt', 'a'.repeat(200 * 1024 + 1)).ok, false);
  assert.equal(validateNewFile('x.py', 'x').ok, false);
  assert.equal(validateNewFile('x.py', 'x', { JEREMIAS_EXTRA_EXTS: 'py, ts' } as any).ok, true);
  assert.match(createTool('crie o arquivo virus.exe com o texto x')!.text, /Não crio/);
});

test('gravação nunca sobrescreve', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-w-'));
  const a = await writeNewFile(path.join(dir, 'Jeremias'), 'nota.txt', 'primeira');
  const b = await writeNewFile(path.join(dir, 'Jeremias'), 'nota.txt', 'segunda');
  assert.equal(path.basename(a), 'nota.txt');
  assert.equal(path.basename(b), 'nota (2).txt');
  assert.equal(fs.readFileSync(a, 'utf8'), 'primeira');
  assert.equal(fs.readFileSync(b, 'utf8'), 'segunda');
  fs.rmSync(dir, { recursive: true, force: true });
});
