# 💈 Barbearia Daniel Camilette — Agendamento

Site de agendamento online da Barbearia Daniel Camilette (desde 1987).
É um site estático (HTML, CSS e JavaScript puros) que usa o **Firebase** como banco de dados e login.

## Páginas

| Arquivo | Para quem | O que faz |
|---|---|---|
| `index.html` | Cliente | Escolhe serviço, dia e horário livre e confirma o agendamento |
| `login.html` | Barbeiro | Login com e-mail e senha (com "esqueci minha senha") |
| `barbeiro.html` | Barbeiro | Vê os próximos agendamentos e o histórico, cancela, abre/fecha a loja e chama o cliente no WhatsApp |

## Estrutura

```
css/estilo.css     tema visual (cores da logo)
js/firebase.js     configuração do Firebase
js/comum.js        CONFIGURAÇÕES DA BARBEARIA + funções de apoio
js/agendar.js      lógica da página do cliente
js/login.js        lógica do login
js/painel.js       lógica do painel do barbeiro
firestore.rules    regras de segurança do banco
```

## Mudar horários, dias e serviços

Tudo fica no começo de `js/comum.js`:

```js
const CONFIG = {
  diasFechados: [0],              // 0 = domingo, 1 = segunda, ... 6 = sábado
  periodos: [
    { nome: "Manhã", inicio: "08:00", fim: "11:00" },
    { nome: "Tarde", inicio: "13:00", fim: "18:00" },
  ],
  intervalo: 30,                  // minutos por horário
  diasParaAgendar: 14,
  servicos: ["Corte Masculino", "Corte Feminino", "Barba"],
};
```

## Como o banco de dados está organizado (Firestore)

- `agendamentos/{data_horario}`: nome, telefone, serviço, data e horário. Só o barbeiro consegue ler.
- `ocupados/{data_horario}`: só a data e o horário, sem dados pessoais. É público e serve para mostrar quais horários estão livres.
- `config/loja`: `{ disponivel: true/false }`. É o botão de abrir/fechar a loja.

O ID de cada documento é a data mais o horário (ex.: `2026-11-28_14:30`). Por isso é impossível dois clientes reservarem o mesmo horário.

## Quem tem acesso ao painel

Só as contas cujo UID está na função `ehBarbeiro()` do `firestore.rules`. Para dar acesso a outra pessoa:
1. Crie a conta em *Authentication* > *Users*.
2. Copie o UID dela e adicione na lista.
3. Publique as regras de novo.

## ⚠️ Passos obrigatórios no Firebase (uma vez só)

1. **Publicar as regras de segurança.** Abra o [Console do Firebase](https://console.firebase.google.com/), entre em *Firestore Database* > *Regras*, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
2. **Bloquear cadastro de novas contas (recomendado).** Em *Authentication* > *Settings* > *User actions*, desmarque *Enable create (sign-up)*.

> Agendamentos criados na versão antiga do site continuam aparecendo no painel. Porém, os horários deles não ficam bloqueados para novos clientes, porque não existem em `ocupados`.

## Rodar no computador

Como o site usa apenas arquivos estáticos, basta servir a pasta:

```bash
npx serve .
```

ou abrir com a extensão *Live Server* do VS Code.
