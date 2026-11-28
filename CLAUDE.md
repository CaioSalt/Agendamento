# CLAUDE.md — Agendamento da Barbearia Daniel Camilette

Contexto para futuras mudanças. Leia antes de mexer no projeto.

## Sobre o dono e o jeito de trabalhar
- O Caio fez a primeira versão na faculdade e quer **entender** o código, não só recebê-lo. Explique as mudanças em português simples. Os comentários do código ficam em português.
- O site é de um amigo barbeiro (Daniel), que é leigo. As telas do painel precisam ser óbvias.
- Fluxo: trabalhar num branch, abrir PR para `main` e mostrar prints antes. **O merge é feito pelo Caio** ou com a autorização explícita dele. Depois do merge de um PR, conferir se o `main` ficou com todos os commits (já aconteceu de um merge levar só parte deles).
- Nunca colocar no repositório (ele é **público**): chave do Firebase, `config.env`, sessão do WhatsApp, números de telefone, IP da VPS, e-mails.

## Arquitetura

```
Cliente ──> Site estático (GitHub Pages, branch main) ──> Firestore (projeto "sistemabarbeiro")
                                                               │
                              VPS Locaweb: avisador (Node) <───┘──> WhatsApp de um chip ──> barbeiro
```

- **Site:** HTML + CSS + JS puros, sem build e sem framework. Firebase **compat SDK 10.11.0** via `gstatic`. Publicado pelo GitHub Pages a partir do `main`.
- **Banco e login:** Firestore + Firebase Auth (e-mail e senha). O plano é o gratuito (Spark).
- **Avisador:** `avisador/`, em Node 22 + Baileys (API **não oficial** do WhatsApp) + firebase-admin, rodando como serviço systemd na VPS (Ubuntu 26.04).

## Arquivos
| Arquivo | Papel |
|---|---|
| `index.html` + `js/agendar.js` | Página do cliente: serviço → dia → horário → dados → confirmação. Tem também a seção "A barbearia" e as tags Open Graph |
| `login.html` + `js/login.js` | Login do barbeiro |
| `barbeiro.html` + `js/painel.js` | Painel: abrir/fechar a loja, abas Próximos / Histórico / Folgas |
| `js/comum.js` | **`CONFIG`** (dias, horários, serviços, informações) e funções de apoio compartilhadas |
| `js/firebase.js` | Configuração do Firebase (a `apiKey` é pública por natureza) |
| `css/estilo.css` | Tema único das três páginas |
| `firestore.rules` | Regras de segurança. **Não são publicadas automaticamente**: o Caio cola no console |
| `img/compartilhar.jpg` | Imagem da prévia do link (1200×630, mantenha abaixo de ~300 KB por causa do WhatsApp) |
| `avisador/` | Avisador do WhatsApp (tem README próprio) |

## Modelo de dados (Firestore)
- `agendamentos/{data_horario}` = `{ nome, telefone, servico, data, horario, criadoEm }`, mais `avisado` e `avisadoEm`, que o avisador grava. Só o barbeiro lê.
- `ocupados/{data_horario}` = `{ data, horario }`, público e sem dados pessoais. O ID determinístico garante que o mesmo horário nunca é reservado duas vezes, porque `create` falha se o documento já existe. Com `bloqueado: true`, é um horário bloqueado pelo barbeiro.
- `config/loja` = `{ disponivel, diasBloqueados: ["AAAA-MM-DD", ...] }`. `disponivel: false` pausa todos os agendamentos. Se o documento não existir, a loja conta como aberta.
- O ID de documento é `AAAA-MM-DD_HH:MM`. As datas são sempre strings `AAAA-MM-DD`, com contas feitas em UTC e fuso `America/Sao_Paulo` para o "agora".
- O agendamento é feito por **transação** do cliente: lê `ocupados/{id}`; se não existir, grava `ocupados` e `agendamentos`.

## Regras de segurança (resumo)
- Barbeiro = `request.auth.uid` na lista da função `ehBarbeiro()`. Só estar logado não basta.
- Cliente: cria `ocupados` (apenas `data` e `horario`, fora de `diasBloqueados`) e o `agendamentos` correspondente (`existsAfter`). Não lê agendamentos.
- Barbeiro: lê, cancela e bloqueia (`ocupados` com `bloqueado: true`) e escreve `config/*`.
- **Teste as regras no emulador antes de entregar** (Java existe no ambiente): `firebase-tools` + `@firebase/rules-unit-testing@6` com `firebase@13` (peer), e `firebase emulators:exec --only firestore`. Na última vez, 17 casos passaram.

## Regras de negócio atuais (em `CONFIG`)
- Domingo fechado (`diasFechados: [0]`).
- Sábado **por ordem de chegada** (`diasOrdemDeChegada: [6]`): o dia aparece na lista com o aviso no lugar dos horários e não aceita agendamento.
- Horários das 08:00 às 11:00 e das 13:00 às 18:00, de 30 em 30 minutos, até 14 dias à frente.
- Serviços sem preço (`preco: null`), porque na cidade não é costume mostrar preço.
- O endereço em texto ainda está vazio; o botão "Como chegar" usa o link do Google Maps em `barbearia.mapa`.

## Avisador (VPS)
- Instalação: `/opt/avisador/app` (clone do repositório, branch `main`), `/opt/avisador/config.env`, `/opt/avisador/chave-firebase.json` e `/opt/avisador/sessao/`. Roda com o usuário de sistema `avisador`.
- O serviço usa `ProtectSystem=strict` e só tem escrita em `/opt/avisador/sessao`: **nunca remova a pasta em si, só o conteúdo dela**.
- Conexão por **código de pareamento**: exige `browser: Browsers.macOS("Chrome")`. Com nome personalizado, o WhatsApp recusa.
- Ao ligar, avisa os agendamentos de até 12 horas atrás que tenham `avisado != true`. Agendamentos antigos sem `criadoEm` são ignorados.
- Use sempre um **chip dedicado**. Não mande mensagem para muitos números diferentes (por exemplo, lembrete para clientes), porque aumenta o risco de banimento. Para isso, o caminho é a API oficial da Meta.
- Para atualizar: `git pull`, `npm ci --omit=dev` e `systemctl restart avisador`.

## Ao mudar algo, lembrar de
- Mudou `firestore.rules`? Testar no emulador e **avisar o Caio para publicar** no console.
- Mudou o endereço do site (domínio)? Atualizar `og:url` e `og:image` no `index.html`.
- Mudou algo no avisador? Avisar que precisa rodar o comando de atualização na VPS.
- Testar as páginas com Playwright usando um Firebase falso (interceptar `gstatic` e servir um stub). **Nunca** testar contra o projeto real.
- Conferir a largura de celular (390px), sem rolagem horizontal.

## Ideias que ficaram para depois
Domínio próprio (`barbeariacamilette.com.br`, a decidir), logo original em arquivo, endereço em texto e WhatsApp da barbearia, aviso de LGPD, painel instalável como app (PWA), serviços com durações diferentes, vários barbeiros, cancelamento pelo cliente, API oficial da Meta no lugar do Baileys. O Caio também quer hospedar na mesma VPS um site simples do jogo dele (página inicial + política de privacidade), usando Caddy e um domínio próprio.
