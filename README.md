# Jeremias A.S.O.

Assistente local com IA e segurança Zero-Trust.

## Rodar (Windows, Mac ou Linux)
```
npm install
copy .env.example .env.local      (Mac/Linux: cp .env.example .env.local)
# edite .env.local e cole a GEMINI_API_KEY (ou use LLM_PROVIDER=ollama)
npm run dev                       # http://localhost:3000
npm test
```
Produção local: `npm run build` e depois `npm start`.

## Abrir como programa (Windows)
Dê dois cliques em `iniciar-jeremias.bat`. Na primeira vez ele instala tudo e pede a chave; nas seguintes só abre.
Para um atalho na Área de Trabalho: botão direito no `.bat` → Enviar para → Área de trabalho (criar atalho).

## Programa com janela própria (sem navegador, sem localhost)
```
npm install
npm install --save-dev electron electron-builder
npm run app          # abre o Jeremias numa janela, para testar
npm run dist:win     # gera o instalador e o .exe portátil em release/
```
- `release/` terá um instalador (`... Setup ....exe`) e um `.exe` portátil (um arquivo só, sem instalar).
- O app guarda configurações e o ledger em `%APPDATA%\jeremias-aso\` (arquivos `.env.local` e `audit.jsonl`). Menu **Arquivo > Configurações** abre o `.env.local` para colar a chave.
- No primeiro acesso, crie uma senha com pelo menos 8 caracteres. Ela é armazenada como hash e protege as APIs; após cinco tentativas erradas, o login fica bloqueado por 15 minutos. No app desktop, a sessão termina ao fechar o app ou após 12 horas; no modo `npm run dev`, termina ao reiniciar o servidor ou após 12 horas. O hash fica em `%APPDATA%\jeremias-aso\auth.json`.
- Para trocar a senha, use o botão **Senha** e informe a senha atual, a nova senha e o código de autorização. O menu **Arquivo > Abrir código de autorização da senha** abre o arquivo atual. No app instalado, ele fica em `%APPDATA%\jeremias-aso\codigo-autorizacao.txt`; em desenvolvimento, inclusive no Electron, fica em `codigo-autorizacao.txt` na pasta do projeto. Após cada troca autorizada, o código é substituído por um novo. O arquivo é ignorado pelo Git, então o código não é publicado no repositório.
- Se esquecer a senha, será necessário possuir o código de autorização local e o acesso ao arquivo de dados para redefinir o cadastro; a troca pela interface sempre exige a senha atual. O código é uma autorização local, não uma proteção contra alguém que já controla a conta do Windows.
- Por dentro há um servidor interno em porta aleatória, só em 127.0.0.1, que só aceita pedidos da janela do app (token novo a cada abertura).
- O `.exe` não é assinado digitalmente: o Windows SmartScreen pode avisar. Clique em **Mais informações > Executar assim mesmo** (só para um programa que você mesmo gerou).
- Docker Desktop continua sendo necessário para o sandbox.

## Modo assistente (padrão) e Modo avançado
Ao abrir, o Jeremias mostra só o que serve no dia a dia: **Assistente** (chat), **Componentes** (painel ao vivo de CPU, RAM, armazenamento, interfaces de rede e conectividade), **Aprovações** (fila dos comandos que pedem o seu OK), **Acessos & alertas** (eventos recentes da API local e detecção passiva de padrões incomuns), **Desenvolvedor** (diagnósticos e varredura protegidos por nova confirmação da senha atual) e **Registro de segurança** (o ledger). Cada resposta traz o texto e a etiqueta LOCAL/NUVEM; os detalhes de política ficam em "Ver detalhes de segurança".

O monitor **Acessos & alertas** mantém em memória os últimos 500 eventos da API durante a execução e alerta sobre falhas repetidas de login, muitas rotas inexistentes, acessos protegidos negados e erros do servidor. Registra método, rota sem query string, status e horário — não registra senha, corpo, cookie ou endereço IP. O histórico é apagado ao reiniciar o servidor.

Na aba **Desenvolvedor**, confirme novamente a senha atual do Jeremias para abrir os diagnósticos. A autorização expira após 15 minutos, pode ser encerrada pelo botão **Bloquear área** e é vinculada à sessão autenticada atual. Cinco tentativas incorretas acionam o bloqueio de 15 minutos do login local. A tela mostra versão e estado do servidor, pastas autorizadas, disponibilidade do sandbox, verificação do ledger e atalhos para os monitores existentes; não exibe valores de variáveis de ambiente.

O botão **Iniciar varredura** na aba **Desenvolvedor** verifica, sob demanda, código-fonte e arquivos de configuração de texto dentro das pastas autorizadas (incluindo a pasta de trabalho quando existente). Procura padrões que merecem revisão, como credenciais possivelmente fixas, verificação TLS desativada, execução dinâmica e pontos de inserção HTML. A varredura não executa nem altera arquivos, não envia conteúdo para a nuvem e não lê arquivos de segredos; pula links simbólicos, pastas ocultas, dependências e binários. Para limitar impacto, analisa até 1.500 arquivos/10 MB ou 5 segundos. O resultado pode conter falsos positivos e não é uma auditoria completa; uma varredura interrompida é marcada como incompleta.

O botão **Modo avançado** (canto direito da barra de abas) liga as abas de estudo e demonstração: simulador de políticas, sandbox com scripts de exemplo, monitor de anomalias, botão de simular adulteração do ledger, radar de taint e os atalhos de exploit simulado. Nada foi apagado. A escolha fica lembrada.

As sugestões do chat são opcionais: aparecem apenas quando a conversa está vazia, após clicar em **Personalizar sugestões** e escolher categorias. As categorias escolhidas ficam salvas no navegador; o Jeremias não monitora nem armazena o uso ou o texto das conversas para personalizá-las.

**Windows:** `!uname`, `!uptime`, `!df` e `!free` só existem em Linux/Mac. No Windows use `!hostname` e `!whoami`, ou pergunte em português ("quanta memória livre?", "quanto espaço livre no disco?", "qual meu processador?"), que o Jeremias responde com as funções do próprio sistema, sem internet.

## Arquivos: ler, abrir e criar
- **Pasta de trabalho:** `Documentos\Jeremias` (mude com `JEREMIAS_WORK_DIR`). É a única pasta onde ele cria arquivos.
- **Criar:** o Jeremias mostra caminho, tamanho e conteúdo, e só grava depois do seu clique. Se o nome já existir, cria "nome (2)". Qualquer resposta do modelo ganha o botão **Salvar como arquivo**.
- **Tipos permitidos na criação:** txt, md, csv, tsv, json, html, htm, css, xml, yaml, yml, log. Scripts e programas (.js, .bat, .ps1, .vbs, .exe...) ficam de fora, porque no Windows alguns rodam com dois cliques. Para liberar outros (ex.: py, ts), use `JEREMIAS_EXTRA_EXTS=py,ts` no `.env.local`.
- **Abrir:** nunca abre programas ou scripts. **Ler/abrir:** `.env`, chaves (`.pem`, `.key`...) e os arquivos do próprio Jeremias (`usuarios.json`, `audit.jsonl`) são recusados.
- **Limites:** ler e abrir só dentro das pastas liberadas (Documentos, Downloads, Área de Trabalho e a pasta de trabalho). O conteúdo lido não vai à nuvem nem entra no histórico; por isso ele não "lembra" do arquivo na pergunta seguinte.
- O ledger registra a criação (tamanho e extensão), nunca o nome nem o conteúdo.

## Quem responde: local primeiro, nuvem só quando precisa
Cada resposta mostra uma etiqueta: **LOCAL · SEM IA**, **LOCAL · MODELO**, **NUVEM · API** ou **AGUARDA SEU SIM**.

| Pedido | Quem resolve | Exemplo |
|---|---|---|
| Hora e data | Local, sem IA | "que horas são", "quantos dias faltam para 25/12/2026" |
| Ler arquivo | Local: mostra o texto no chat (até 100 KB), só nas pastas liberadas | "leia o arquivo notas.txt" |
| Abrir arquivo | Local: abre no programa padrão, só tipos seguros (PDF, Office, imagens, áudio, vídeo, txt, html) | "abra o arquivo ficha.pdf" |
| Criar arquivo | Local, **só após o seu clique em "Criar arquivo"**; grava na pasta de trabalho, nunca sobrescreve | "crie o arquivo notas.txt com o texto Estudar CSS" |
| Estado do PC | Local, funciona em Windows/Mac/Linux | "quanta memória livre", "espaço livre no disco", "qual meu processador", "demonstre os componentes do computador" |
| Conexão com a internet | Teste explícito de conectividade; envia uma solicitação vazia ao endpoint de verificação do Google, sem texto de conversa | "verifique a conexão com a internet" |
| Contas | Local, parser próprio (sem `eval`) | "quanto é 15% de 230", "calcule (3+4)*2^3", "raiz quadrada de 81" |
| Unidades | Local | "converta 10 km para milhas", "100 celsius em fahrenheit" |
| Validação | Local | "validar cpf 529.982.247-25", "verifique o e-mail ...", "29/02/2028 é válida?" |
| Arquivos | Local, somente leitura, só nas pastas liberadas | "encontre o arquivo relatorio pdf", "hash sha256 de \"C:\\...\\a.txt\"" |
| Conversa geral | Ollama (local), se instalado | "explique o que é flexbox" |
| Pesquisa e atualidades | Nuvem (Gemini com busca), **só após o seu clique** | "pesquise as últimas notícias sobre ..." |

- O que vai à nuvem: apenas o texto daquela pergunta. Nunca o histórico, nunca resultados de busca de arquivos, nunca conteúdo de arquivos.
- O teste de conectividade só confirma se o Jeremias alcança um serviço externo; não monitora o tráfego dos demais programas.
- Sem Ollama, conversa geral também pede confirmação antes de ir à nuvem.
- O ledger registra que houve envio (tamanho em bytes), nunca o conteúdo.
- Validação de CPF/CNPJ confere só os dígitos verificadores; não consulta a Receita.
- Se o Jeremias não reconhecer o padrão, o pedido segue para o modelo; por isso as ferramentas locais só disparam com frases claras.

## O que é real
| Recurso | Como funciona |
|---|---|
| Memória efêmera | Histórico só em Buffers na RAM do servidor; "purgar" sobrescreve com 0x00. Cópias transitórias do V8 (ex.: a string do prompt durante a requisição) não são controláveis. |
| Política | Motor policy-as-code em TypeScript (não é o binário OPA/Rego). Negado por padrão. |
| Comandos `!` | Lista permitida (somente leitura, sem shell, sem argumentos livres) roda no host. Fora dela: aprovação humana e execução só no sandbox. |
| Sandbox | Docker real: rede desligada, FS somente-leitura, sem capabilities, `--cpus 0.1 --memory 64m --pids-limit 32`, seccomp (padrão do Docker ou o seu). **Sem Docker, nada é executado.** Não é MicroVM. |
| Ledger | SHA-256 encadeado, gravado em `data/audit.jsonl` e verificado ao iniciar. Quem controla a máquina pode reescrever a cadeia inteira; para blindar de verdade, ancore o último hash em outro lugar. |
| Modelo | Gemini (nuvem: o prompt sai da máquina) ou Ollama (local). O painel indica qual está em uso. |

## Docker no Windows
Instale o Docker Desktop (com WSL2) e rode uma vez: `docker pull alpine:3`.
