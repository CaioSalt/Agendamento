// ==========================================================
// Configurações da barbearia — altere aqui!
// ==========================================================
const CONFIG = {
  fusoHorario: "America/Sao_Paulo",

  // Dias da semana sem atendimento (0 = domingo, 1 = segunda, ... 6 = sábado)
  diasFechados: [0],

  // Dias sem agendamento, atendidos por ordem de chegada (6 = sábado).
  // O cliente vê o dia na lista, mas com o aviso em vez dos horários.
  diasOrdemDeChegada: [6],

  // Períodos de atendimento. "fim" é o horário em que fecha (não é agendável).
  periodos: [
    { nome: "Manhã", inicio: "08:00", fim: "11:00" },
    { nome: "Tarde", inicio: "13:00", fim: "18:00" },
  ],

  // Duração de cada horário, em minutos
  intervalo: 30,

  // Quantos dias à frente o cliente pode escolher
  diasParaAgendar: 14,

  // Serviços e preços. Use preco: null para não mostrar o preço.
  servicos: [
    { nome: "Corte Masculino", preco: null },
    { nome: "Corte Feminino", preco: null },
    { nome: "Barba", preco: null },
  ],

  // Informações da barbearia mostradas no site. Deixe "" para esconder.
  barbearia: {
    endereco: "",  // texto do endereço, ex.: "Rua Exemplo, 123 - Centro, Cidade - ES"
    mapa: "https://maps.app.goo.gl/BNfhs6ruftYW9U526", // link do Google Maps (botão "Como chegar")
    whatsapp: "",  // só números com DDD, ex.: "28999999999"
    instagram: "danielcamilette", // sem o @
  },
};

// ==========================================================
// Funções de apoio usadas pelas páginas
// ==========================================================

// "08:30" -> 510
function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 510 -> "08:30"
function paraHHMM(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Lista de horários de um período: ["08:00", "08:30", ...]
function horariosDoPeriodo(periodo) {
  const lista = [];
  for (let t = paraMinutos(periodo.inicio); t < paraMinutos(periodo.fim); t += CONFIG.intervalo) {
    lista.push(paraHHMM(t));
  }
  return lista;
}

function todosHorarios() {
  return CONFIG.periodos.flatMap(horariosDoPeriodo);
}

// Data e hora atuais no fuso da barbearia (não depende do relógio/fuso do celular do cliente
// estar configurado para o Brasil).
function agoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.fusoHorario,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return {
    data: `${p.year}-${p.month}-${p.day}`, // "2026-11-27"
    minutos: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

// Trabalhamos com datas como texto "AAAA-MM-DD" e fazemos as contas em UTC
// para não ter problema com fuso horário.
function dataUTC(dataISO) {
  const [a, m, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(dataISO, n) {
  const dt = dataUTC(dataISO);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function diaDaSemana(dataISO) {
  return dataUTC(dataISO).getUTCDay();
}

function formatarData(dataISO, opcoes) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opcoes }).format(dataUTC(dataISO));
}

// "sexta-feira, 28 de novembro"
function dataPorExtenso(dataISO) {
  return formatarData(dataISO, { weekday: "long", day: "numeric", month: "long" });
}

// Situação da loja agora (pelo horário de funcionamento)
function situacaoAgora() {
  const { data, minutos } = agoraLocal();
  if (CONFIG.diasFechados.includes(diaDaSemana(data))) return { aberto: false };
  for (const p of CONFIG.periodos) {
    if (minutos >= paraMinutos(p.inicio) && minutos < paraMinutos(p.fim)) {
      return { aberto: true, fechaAs: p.fim };
    }
  }
  return { aberto: false };
}

// Cria um elemento com classe e texto. Usar textContent evita que um nome
// digitado pelo cliente vire código HTML na página (ataque de XSS).
function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function apenasDigitos(texto) {
  return (texto || "").replace(/\D/g, "");
}

// "11912345678" -> "(11) 91234-5678"
function formatarTelefone(texto) {
  const d = apenasDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// 35 -> "R$ 35"   |   35.5 -> "R$ 35,50"
function formatarPreco(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
  }).format(valor);
}

// "08:00" -> "8h"   |   "13:30" -> "13h30"
function horaCurta(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Texto do horário de funcionamento a partir do CONFIG.
// Ex.: "Segunda a sábado · 8h às 11h e 13h às 18h"
function textoFuncionamento() {
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const ordem = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda
  const chegada = CONFIG.diasOrdemDeChegada || [];
  const abertos = ordem.filter((d) => !CONFIG.diasFechados.includes(d) && !chegada.includes(d));

  // Agrupa dias seguidos: [seg, ter, qua] -> "segunda a quarta"
  const grupos = [];
  abertos.forEach((d) => {
    const ultimo = grupos.at(-1);
    if (ultimo && ordem.indexOf(d) === ordem.indexOf(ultimo.at(-1)) + 1) ultimo.push(d);
    else grupos.push([d]);
  });
  const dias = grupos
    .map((g) => (g.length > 2 ? `${nomes[g[0]]} a ${nomes[g.at(-1)]}` : g.map((d) => nomes[d]).join(", ")))
    .join(", ");
  const horas = CONFIG.periodos.map((p) => `${horaCurta(p.inicio)} às ${horaCurta(p.fim)}`).join(" e ");
  const linhas = [];
  if (dias) linhas.push(`${dias.charAt(0).toUpperCase()}${dias.slice(1)} · ${horas}`);
  ordem.filter((d) => chegada.includes(d) && !CONFIG.diasFechados.includes(d)).forEach((d) => {
    const nome = nomes[d].charAt(0).toUpperCase() + nomes[d].slice(1);
    linhas.push(`${nome} · ${horas}, por ordem de chegada`);
  });
  return linhas.join("\n");
}

// Dia atendido por ordem de chegada (sem agendamento)?
function ehOrdemDeChegada(dataISO) {
  return (CONFIG.diasOrdemDeChegada || []).includes(diaDaSemana(dataISO));
}

// ID do documento = data + horário. Assim o mesmo horário nunca é gravado duas vezes.
function idDoHorario(data, horario) {
  return `${data}_${horario}`;
}
