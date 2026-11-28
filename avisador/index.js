// ==========================================================
// Avisador de agendamentos — Barbearia Daniel Camilette
//
// Fica de olho no Firestore e, quando entra um agendamento novo,
// manda uma mensagem no WhatsApp do barbeiro.
//
// Roda na VPS como serviço (veja avisador.service e o README).
// Configuração por variáveis de ambiente (arquivo config.env):
//   NUMERO_BARBEIRO   número que RECEBE os avisos  (ex.: 5528999999999)
//   NUMERO_AVISADOR   número do chip que ENVIA     (ex.: 5528999103900)
//   PASTA_SESSAO      onde guardar o login do WhatsApp
//   GOOGLE_APPLICATION_CREDENTIALS  caminho da chave do Firebase (JSON)
// ==========================================================

import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "baileys";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import pino from "pino";
import { montarMensagem } from "./mensagem.js";

const NUMERO_BARBEIRO = apenasDigitos(process.env.NUMERO_BARBEIRO);
const NUMERO_AVISADOR = apenasDigitos(process.env.NUMERO_AVISADOR);
const PASTA_SESSAO = process.env.PASTA_SESSAO || "./sessao";

// Agendamentos criados até 12 horas antes de o avisador ligar também são avisados
// (cobre o caso de a VPS ter ficado fora do ar), mas sem mandar o histórico inteiro.
const JANELA_MS = 12 * 60 * 60 * 1000;

function apenasDigitos(texto) {
  return (texto || "").replace(/\D/g, "");
}

function log(...args) {
  console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "|", ...args);
}

if (NUMERO_BARBEIRO.length < 12 || NUMERO_AVISADOR.length < 12) {
  log("ERRO: configure NUMERO_BARBEIRO e NUMERO_AVISADOR com 55 + DDD + número (ex.: 5528999103900).");
  process.exit(1);
}

// ---------- Firebase ----------

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const pendentes = new Map(); // id do agendamento -> dados
let processando = false;

function ouvirAgendamentos() {
  const desde = Timestamp.fromMillis(Date.now() - JANELA_MS);
  db.collection("agendamentos")
    .where("criadoEm", ">=", desde)
    .onSnapshot(
      (snap) => {
        snap.docChanges().forEach((mudanca) => {
          const id = mudanca.doc.id;
          const dados = mudanca.doc.data();
          if (mudanca.type === "removed" || dados.avisado) pendentes.delete(id);
          else pendentes.set(id, dados);
        });
        processarPendentes();
      },
      (erro) => {
        log("ERRO no Firestore:", erro.message);
        process.exit(1); // o systemd reinicia o avisador
      }
    );
  log("Ouvindo novos agendamentos no Firebase.");
}

// ---------- WhatsApp ----------

let sock = null;
let conectado = false;
let jidBarbeiro = null;
let acabouDeParear = false;

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "error" }),
    // A conexão por código só funciona com um navegador "real" (aparece como Chrome no Mac).
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  let codigoPedido = false;
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // Primeira vez: em vez de QR Code, gera um código para digitar no celular.
    if (qr && !state.creds.registered && !codigoPedido) {
      codigoPedido = true;
      try {
        const codigo = await sock.requestPairingCode(NUMERO_AVISADOR);
        log("============================================================");
        log(`CÓDIGO PARA CONECTAR: ${codigo.slice(0, 4)}-${codigo.slice(4)}`);
        log("No celular do chip: WhatsApp > Aparelhos conectados >");
        log("Conectar aparelho > Conectar com número de telefone");
        log("============================================================");
        acabouDeParear = true;
      } catch (erro) {
        log("ERRO ao gerar o código de conexão:", erro.message);
      }
    }

    if (connection === "open") {
      conectado = true;
      log("WhatsApp conectado!");
      await descobrirBarbeiro();
      if (acabouDeParear && jidBarbeiro) {
        acabouDeParear = false;
        await enviar("✅ Avisador da Barbearia conectado!\nA partir de agora os novos agendamentos chegam aqui. 💈");
      }
      processarPendentes();
    }

    if (connection === "close") {
      conectado = false;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        // O aparelho foi desconectado pelo celular: apaga a sessão e espera.
        log("O WhatsApp foi DESCONECTADO pelo celular.");
        log("Para conectar de novo, rode:  systemctl restart avisador");
        await limparSessao();
        return;
      }
      log(`Conexão caiu (código ${codigo ?? "?"}). Reconectando em 5 segundos…`);
      setTimeout(() => conectarWhatsApp().catch(falhaGrave), 5000);
    }
  });
}

// Apaga o login salvo (o conteúdo da pasta, não a pasta em si: o serviço
// só tem permissão de escrever DENTRO dela).
async function limparSessao() {
  try {
    const arquivos = await readdir(PASTA_SESSAO);
    await Promise.all(arquivos.map((a) => rm(join(PASTA_SESSAO, a), { recursive: true, force: true })));
  } catch (erro) {
    log("ERRO ao limpar a sessão:", erro.message);
  }
}

// O WhatsApp de alguns números brasileiros não usa o 9º dígito,
// então perguntamos ao próprio WhatsApp qual é o endereço certo.
async function descobrirBarbeiro() {
  if (jidBarbeiro) return;
  try {
    const [resultado] = await sock.onWhatsApp(NUMERO_BARBEIRO);
    if (resultado?.exists) {
      jidBarbeiro = resultado.jid;
      log("Avisos serão enviados para:", NUMERO_BARBEIRO);
    } else {
      log(`ERRO: o número ${NUMERO_BARBEIRO} não tem WhatsApp. Confira o NUMERO_BARBEIRO no config.env.`);
    }
  } catch (erro) {
    log("ERRO ao procurar o número do barbeiro:", erro.message);
  }
}

async function enviar(texto) {
  await sock.sendMessage(jidBarbeiro, { text: texto });
}

// ---------- Envio dos avisos ----------

async function processarPendentes() {
  if (processando || !conectado || !jidBarbeiro || pendentes.size === 0) return;
  processando = true;
  try {
    for (const [id, dados] of pendentes) {
      try {
        await enviar(montarMensagem(dados));
        await db.collection("agendamentos").doc(id).update({
          avisado: true,
          avisadoEm: FieldValue.serverTimestamp(),
        });
        pendentes.delete(id);
        log(`Aviso enviado: ${dados.data} ${dados.horario} — ${dados.nome}`);
        await new Promise((r) => setTimeout(r, 1500)); // sem pressa, para não parecer robô
      } catch (erro) {
        log(`ERRO ao avisar ${id} (tento de novo em 1 minuto):`, erro.message);
        break;
      }
    }
  } finally {
    processando = false;
  }
}

function falhaGrave(erro) {
  log("ERRO grave:", erro?.stack || erro);
  process.exit(1); // o systemd reinicia o avisador
}

// Qualquer erro inesperado: registra no log e sai (o systemd reinicia).
process.on("unhandledRejection", falhaGrave);

// Se algo falhou, tenta de novo a cada minuto.
setInterval(processarPendentes, 60 * 1000);

log("Iniciando o avisador…");
ouvirAgendamentos();
conectarWhatsApp().catch(falhaGrave);
