# 💈 Avisador de agendamentos (WhatsApp)

Programa que roda na VPS e manda uma mensagem no WhatsApp do barbeiro sempre que entra um agendamento novo no site.

```
Site ──> Firebase ──> Avisador (VPS) ──> WhatsApp do chip ──> WhatsApp do barbeiro
```

- Usa a biblioteca **Baileys**, que conecta como um "aparelho conectado" (igual ao WhatsApp Web).
- ⚠️ Não é a API oficial da Meta. Use **sempre um chip separado** só para isso, nunca o WhatsApp pessoal de ninguém.
- Se a VPS cair, o site continua funcionando: os agendamentos de até 12 horas atrás são avisados quando o avisador voltar.
- Depois de avisar, o agendamento recebe o campo `avisado: true` no Firestore, para não ser avisado duas vezes.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.js` | O avisador |
| `mensagem.js` | Texto da mensagem (pode personalizar) |
| `avisador.service` | Configuração para rodar como serviço no Linux (systemd) |

Na VPS ficam também, **fora do Git**:
- `/opt/avisador/config.env`: os números de telefone.
- `/opt/avisador/chave-firebase.json`: chave de administrador do Firebase. **É secreta.**
- `/opt/avisador/sessao/`: o login do WhatsApp. **É secreto**: quem tem essa pasta controla o WhatsApp do chip.

## Comandos do dia a dia (na VPS)

```bash
systemctl status avisador          # está rodando?
journalctl -u avisador -f          # ver o que está acontecendo (Ctrl+C para sair)
systemctl restart avisador         # reiniciar
```

### Atualizar o código
```bash
cd /opt/avisador/app && git pull && cd avisador && npm ci --omit=dev && systemctl restart avisador
```

### Trocar o número do barbeiro
Edite `/opt/avisador/config.env` (`nano /opt/avisador/config.env`) e depois rode `systemctl restart avisador`.

### O WhatsApp foi desconectado
Rode `systemctl restart avisador` e depois `journalctl -u avisador -f`. Vai aparecer um novo código para digitar no celular, em *Aparelhos conectados > Conectar aparelho > Conectar com número de telefone*.

⚠️ O celular com o chip precisa abrir o WhatsApp de vez em quando. Depois de uns 14 dias sem conexão, o WhatsApp desconecta os aparelhos conectados.
